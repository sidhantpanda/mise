import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold, type SignedUpUserWithHousehold } from "../helpers/client.js";

setUpClient();

async function actor(): Promise<SignedUpUserWithHousehold> {
  return withHousehold();
}

describe("POST /api/recipes", () => {
  it("creates from a flat body", async () => {
    const user = await actor();
    const res = await user.agent
      .post("/api/recipes")
      .send({ name: "Tomato Soup", recipeIngredient: ["Tomato", "Salt"] })
      .expect(201);
    expect(res.body.name).toBe("Tomato Soup");
    expect(res.body.recipeIngredient).toEqual(["Tomato", "Salt"]);
  });

  it("creates from a bare JSON-LD Recipe node", async () => {
    const user = await actor();
    const res = await user.agent
      .post("/api/recipes")
      .send({ "@context": "https://schema.org", "@type": "Recipe", name: "Bare Node Soup" })
      .expect(201);
    expect(res.body.name).toBe("Bare Node Soup");
  });

  it("creates from an @graph document", async () => {
    const user = await actor();
    const res = await user.agent
      .post("/api/recipes")
      .send({
        "@graph": [
          { "@type": "WebPage" },
          { "@type": "Recipe", name: "Graph Soup" },
        ],
      })
      .expect(201);
    expect(res.body.name).toBe("Graph Soup");
  });

  it("400s for a body with no usable name", async () => {
    const user = await actor();
    await user.agent.post("/api/recipes").send({ description: "No name here" }).expect(400);
  });
});

describe("PATCH /api/recipes/:id", () => {
  it("leaves unmentioned fields intact", async () => {
    const user = await actor();
    const created = await user.agent
      .post("/api/recipes")
      .send({ name: "Original", description: "Keep me", recipeCuisine: "Italian" })
      .expect(201);

    const patched = await user.agent
      .patch(`/api/recipes/${created.body.identifier}`)
      .send({ name: "Renamed" })
      .expect(200);

    expect(patched.body.name).toBe("Renamed");
    expect(patched.body.description).toBe("Keep me");
    expect(patched.body.recipeCuisine).toBe("Italian");
  });

  it("a body with no recipe fields at all is a no-op, not an error", async () => {
    const user = await actor();
    const created = await user.agent
      .post("/api/recipes")
      .send({ name: "Untouched", description: "Still here", recipeCuisine: "Japanese" })
      .expect(201);

    const patched = await user.agent
      .patch(`/api/recipes/${created.body.identifier}`)
      .send({})
      .expect(200);

    expect(patched.body.name).toBe("Untouched");
    expect(patched.body.description).toBe("Still here");
    expect(patched.body.recipeCuisine).toBe("Japanese");
  });
});

describe("DELETE /api/recipes/:id", () => {
  it("also deletes that recipe's planned meals", async () => {
    const user = await actor();
    const recipe = await user.agent.post("/api/recipes").send({ name: "To delete" }).expect(201);
    const meal = await user.agent
      .post("/api/meals")
      .send({ date: "2026-01-01", mealType: "Dinner", recipeId: recipe.body.identifier })
      .expect(201);

    await user.agent.delete(`/api/recipes/${recipe.body.identifier}`).expect(200);

    const meals = await user.agent.get("/api/meals").expect(200);
    expect(meals.body.find((m: { identifier: string }) => m.identifier === meal.body.identifier)).toBeUndefined();
  });
});

describe("GET /api/recipes/export", () => {
  it("400s when the household has zero recipes", async () => {
    const user = await actor();
    await user.agent.get("/api/recipes/export").expect(400);
  });

  it("round-trips through POST /upload and reproduces the same recipes", async () => {
    const user = await actor();
    await user.agent
      .post("/api/recipes")
      .send({ name: "Round Trip Soup", recipeIngredient: ["Water"] })
      .expect(201);

    const exportRes = await user.agent
      .get("/api/recipes/export")
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const secondUser = await actor();
    const uploadRes = await secondUser.agent
      .post("/api/recipes/upload")
      .attach("file", exportRes.body as Buffer, "export.zip")
      .expect(201);

    expect(uploadRes.body.created).toHaveLength(1);
    expect(uploadRes.body.created[0].name).toBe("Round Trip Soup");
    expect(uploadRes.body.created[0].recipeIngredient).toEqual(["Water"]);
  });

  it("de-duplicates export filenames when two recipes share a name", async () => {
    const user = await actor();
    await user.agent.post("/api/recipes").send({ name: "Chili" }).expect(201);
    await user.agent.post("/api/recipes").send({ name: "Chili" }).expect(201);

    const res = await user.agent
      .get("/api/recipes/export")
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const { unzipSync } = await import("fflate");
    const entries = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(entries).sort()).toEqual(["chili-2.json", "chili.json"]);
  });
});
