import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";

setUpClient();

function jsonLd(name: string) {
  return JSON.stringify({ "@context": "https://schema.org", "@type": "Recipe", name });
}

describe("POST /api/recipes/upload", () => {
  it("accepts a single .json file", async () => {
    const user = await withHousehold();
    const res = await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from(jsonLd("From JSON")), "recipe.json")
      .expect(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].name).toBe("From JSON");
  });

  it("accepts a single .jsonld file", async () => {
    const user = await withHousehold();
    const res = await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from(jsonLd("From JSONLD")), "recipe.jsonld")
      .expect(201);
    expect(res.body.created).toHaveLength(1);
  });

  it("accepts a .zip of several recipes", async () => {
    const user = await withHousehold();
    const zipped = zipSync({
      "a.json": strToU8(jsonLd("Zip Recipe A")),
      "b.json": strToU8(jsonLd("Zip Recipe B")),
    });
    const res = await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from(zipped), "recipes.zip")
      .expect(201);
    expect(res.body.created).toHaveLength(2);
    expect(res.body.errors).toHaveLength(0);
  });

  it("returns 201 with both created and errors for a zip mixing valid and invalid documents", async () => {
    const user = await withHousehold();
    const zipped = zipSync({
      "good.json": strToU8(jsonLd("Valid Recipe")),
      // No `name`, no usable recipe fields at all — createRecipe throws AppError(400).
      "bad.json": strToU8(
        JSON.stringify({ "@context": "https://schema.org", "@type": "Recipe" }),
      ),
    });
    const res = await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from(zipped), "mixed.zip")
      .expect(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].source).toBe("bad.json");
  });

  it("400s when every document in the zip is invalid", async () => {
    const user = await withHousehold();
    const zipped = zipSync({
      "bad1.json": strToU8(JSON.stringify({ "@context": "https://schema.org", "@type": "Recipe" })),
      "bad2.json": strToU8(JSON.stringify({ "@context": "https://schema.org", "@type": "Recipe" })),
    });
    await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from(zipped), "allbad.zip")
      .expect(400);
  });

  it("400s for a .json file that isn't valid JSON", async () => {
    const user = await withHousehold();
    const res = await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from("{not valid json"), "recipe.json")
      .expect(400);
    expect(res.body.error).toMatch(/not valid JSON/i);
  });

  it("400s for a .txt file", async () => {
    const user = await withHousehold();
    await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from("just some text"), "notes.txt")
      .expect(400);
  });

  it("400s for a corrupt zip", async () => {
    const user = await withHousehold();
    await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from("PK\x03\x04not-actually-a-zip"), "broken.zip")
      .expect(400);
  });

  it("400s for a file over the 10 MB multer limit", async () => {
    const user = await withHousehold();
    const big = Buffer.alloc(11 * 1024 * 1024, "a");
    const res = await user.agent
      .post("/api/recipes/upload")
      .attach("file", big, "huge.json")
      .expect(400);
    expect(res.body.error).toBe("Upload file is too large");
  });

  it("400s for a zip whose entries are not recipes at all", async () => {
    const user = await withHousehold();
    const zipped = zipSync({
      "not-a-recipe.json": strToU8(JSON.stringify({ "@type": "WebPage", name: "Just a page" })),
    });
    await user.agent
      .post("/api/recipes/upload")
      .attach("file", Buffer.from(zipped), "norecipes.zip")
      .expect(400);
  });
});
