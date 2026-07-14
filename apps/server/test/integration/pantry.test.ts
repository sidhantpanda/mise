import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";

setUpClient();

describe("pantry CRUD", () => {
  it("creates, updates, and deletes a pantry item", async () => {
    const user = await withHousehold();
    const created = await user.agent
      .post("/api/pantry")
      .send({ name: "Rice", location: "Pantry", quantity: { value: 2, unitText: "kg" } })
      .expect(201);
    expect(created.body.quantity).toEqual({ "@type": "QuantitativeValue", value: 2, unitText: "kg" });

    const updated = await user.agent
      .patch(`/api/pantry/${created.body.identifier}`)
      .send({ location: "Freezer" })
      .expect(200);
    expect(updated.body.location).toBe("Freezer");
    // Unmentioned fields survive a partial PATCH.
    expect(updated.body.name).toBe("Rice");

    await user.agent.delete(`/api/pantry/${created.body.identifier}`).expect(200);
    const list = await user.agent.get("/api/pantry").expect(200);
    expect(list.body).toHaveLength(0);
  });

  it("rejects an unknown location", async () => {
    const user = await withHousehold();
    await user.agent.post("/api/pantry").send({ name: "Rice", location: "Garage" }).expect(400);
  });
});
