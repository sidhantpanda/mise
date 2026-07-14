import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";
import { addMember, makeMeal, makeRecipe, makeUser } from "../helpers/factories.js";
import { prisma } from "../../src/prisma.js";

setUpClient();

describe("meals CRUD", () => {
  it("creates, updates, and deletes a planned meal", async () => {
    const user = await withHousehold();
    const recipe = await makeRecipe(user.household.id as string);

    const created = await user.agent
      .post("/api/meals")
      .send({ date: "2026-02-01", mealType: "Breakfast", recipeId: recipe.id })
      .expect(201);

    const updated = await user.agent
      .patch(`/api/meals/${created.body.identifier}`)
      .send({ servings: 4 })
      .expect(200);
    expect(updated.body.servings).toBe(4);

    await user.agent.delete(`/api/meals/${created.body.identifier}`).expect(200);
    const list = await user.agent.get("/api/meals").expect(200);
    expect(list.body).toHaveLength(0);
  });

  it("rejects an unknown mealType", async () => {
    const user = await withHousehold();
    const recipe = await makeRecipe(user.household.id as string);
    await user.agent
      .post("/api/meals")
      .send({ date: "2026-02-01", mealType: "Brunch", recipeId: recipe.id })
      .expect(400);
  });

  it("rejects a meal referencing a recipe from another household", async () => {
    const user = await withHousehold();
    const other = await withHousehold();
    const foreignRecipe = await makeRecipe(other.household.id as string);

    await user.agent
      .post("/api/meals")
      .send({ date: "2026-02-01", mealType: "Dinner", recipeId: foreignRecipe.id })
      .expect(404);

    const meals = await prisma.plannedMeal.findMany({
      where: { householdId: user.household.id as string },
    });
    expect(meals).toHaveLength(0);
  });

  it("rejects PATCH swapping in another household's recipe id", async () => {
    const user = await withHousehold();
    const recipe = await makeRecipe(user.household.id as string);
    const other = await withHousehold();
    const foreignRecipe = await makeRecipe(other.household.id as string);
    const meal = await makeMeal(user.household.id as string, { recipeId: recipe.id });

    await user.agent
      .patch(`/api/meals/${meal.id}`)
      .send({ recipeId: foreignRecipe.id })
      .expect(404);

    const unchanged = await prisma.plannedMeal.findUniqueOrThrow({ where: { id: meal.id } });
    expect(unchanged.recipeId).toBe(recipe.id);
  });

  it("rejects an assignee who is not a member of the household", async () => {
    const user = await withHousehold();
    const recipe = await makeRecipe(user.household.id as string);
    await user.agent
      .post("/api/meals")
      .send({
        date: "2026-02-01",
        mealType: "Dinner",
        recipeId: recipe.id,
        assignee: "not-a-real-user-id",
      })
      .expect(400);

    const meals = await prisma.plannedMeal.findMany({
      where: { householdId: user.household.id as string },
    });
    expect(meals).toHaveLength(0);
  });

  it("accepts a valid household member as assignee", async () => {
    const user = await withHousehold();
    const member = await makeUser();
    await addMember(user.household.id as string, member.id);
    const recipe = await makeRecipe(user.household.id as string);

    const res = await user.agent
      .post("/api/meals")
      .send({
        date: "2026-02-01",
        mealType: "Dinner",
        recipeId: recipe.id,
        assignee: member.id,
      })
      .expect(201);
    expect(res.body.assignee).toBe(member.id);
  });

  it("clears the assignment when PATCH sends assignee: null", async () => {
    const user = await withHousehold();
    const member = await makeUser();
    await addMember(user.household.id as string, member.id);
    const recipe = await makeRecipe(user.household.id as string);
    const meal = await makeMeal(user.household.id as string, {
      recipeId: recipe.id,
      assigneeId: member.id,
    });

    const res = await user.agent
      .patch(`/api/meals/${meal.id}`)
      .send({ assignee: null })
      .expect(200);
    expect(res.body.assignee).toBeUndefined();
  });
});
