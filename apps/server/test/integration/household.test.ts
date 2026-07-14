import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";

setUpClient();

describe("GET /api/household", () => {
  it("returns the caller's active household", async () => {
    const user = await withHousehold({ householdName: "My Kitchen" });
    const res = await user.agent.get("/api/household").expect(200);
    expect(res.body.id).toBe(user.household.id);
    expect(res.body.name).toBe("My Kitchen");
  });
});

describe("PATCH /api/household", () => {
  it("updates the household's name and type", async () => {
    const user = await withHousehold();
    const res = await user.agent
      .patch("/api/household")
      .send({ name: "Renamed Kitchen", type: "Restaurant" })
      .expect(200);
    expect(res.body.name).toBe("Renamed Kitchen");
    expect(res.body.type).toBe("Restaurant");
  });
});

describe("DELETE /api/household/invitations/:id", () => {
  it("404s for an invitation that doesn't belong to the household", async () => {
    const user = await withHousehold();
    await user.agent.delete("/api/household/invitations/nonexistent-id").expect(404);
  });

  it("removes a pending invitation", async () => {
    const user = await withHousehold();
    const created = await user.agent
      .post("/api/household/invitations")
      .send({ email: "invitee@example.test" })
      .expect(201);
    const invitationId = created.body.invitations[0].id;

    const res = await user.agent
      .delete(`/api/household/invitations/${invitationId}`)
      .expect(200);
    expect(res.body.invitations).toHaveLength(0);
  });
});
