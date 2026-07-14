import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/auth.js";
import { generateAccessToken, hashAccessToken, tokenPrefix } from "../../src/lib/accessTokens.js";

// Writes straight through Prisma so integration specs can set up state (or
// deliberately weird state, like a backdated OAuth code) without going through
// the API. Every factory takes overrides so a test only has to spell out what it
// cares about.

let counter = 0;
function unique(label: string): string {
  counter += 1;
  return `${label}-${counter}-${crypto.randomBytes(4).toString("hex")}`;
}

export function uniqueEmail(label = "user"): string {
  return `${unique(label)}@example.test`;
}

export async function makeUser(overrides: Partial<Parameters<typeof prisma.user.create>[0]["data"]> = {}) {
  const password = "password123";
  return prisma.user.create({
    data: {
      email: uniqueEmail(),
      displayName: unique("User"),
      passwordHash: await hashPassword(password),
      ...overrides,
    },
  });
}

export async function makeHousehold(params: {
  ownerId: string;
  name?: string;
  type?: "Household" | "Restaurant";
  setActive?: boolean;
}) {
  const household = await prisma.household.create({
    data: {
      name: params.name ?? unique("Household"),
      type: params.type ?? "Household",
      createdById: params.ownerId,
    },
  });
  await prisma.householdMember.create({
    data: { householdId: household.id, userId: params.ownerId, role: "Owner" },
  });
  if (params.setActive ?? true) {
    await prisma.user.update({
      where: { id: params.ownerId },
      data: { activeHouseholdId: household.id },
    });
  }
  return household;
}

export async function addMember(
  householdId: string,
  userId: string,
  role: "Owner" | "Admin" | "Member" = "Member",
) {
  return prisma.householdMember.create({ data: { householdId, userId, role } });
}

// A user + their own household in one call — the common case for a test's "actor".
export async function makeUserWithHousehold(overrides: Partial<{ name: string }> = {}) {
  const user = await makeUser();
  const household = await makeHousehold({ ownerId: user.id, name: overrides.name });
  return { user, household };
}

export async function makeRecipe(
  householdId: string,
  overrides: Partial<Prisma.RecipeUncheckedCreateInput> = {},
) {
  return prisma.recipe.create({
    data: {
      householdId,
      name: unique("Recipe"),
      recipeIngredient: ["Salt", "Water"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Combine everything." }],
      ...overrides,
    },
  });
}

export async function makeMeal(
  householdId: string,
  overrides: Partial<Prisma.PlannedMealUncheckedCreateInput> = {},
) {
  return prisma.plannedMeal.create({
    data: {
      householdId,
      date: "2026-01-01",
      mealType: "Dinner",
      servings: 1,
      ...overrides,
    },
  });
}

export async function makeShoppingItem(
  householdId: string,
  overrides: Partial<Prisma.ShoppingItemUncheckedCreateInput> = {},
) {
  return prisma.shoppingItem.create({
    data: { householdId, name: unique("Item"), ...overrides },
  });
}

export async function makePantryItem(
  householdId: string,
  overrides: Partial<Prisma.PantryItemUncheckedCreateInput> = {},
) {
  return prisma.pantryItem.create({
    data: { householdId, name: unique("Pantry item"), ...overrides },
  });
}

export async function makeInvitation(
  householdId: string,
  email: string,
  overrides: Partial<Prisma.InvitationUncheckedCreateInput> = {},
) {
  return prisma.invitation.create({ data: { householdId, email, ...overrides } });
}

// Mints a real AccessToken row and returns the raw bearer value alongside it —
// the only place the raw token exists outside this one moment (only its hash is
// ever stored), matching how the app itself issues tokens.
export async function makeAccessToken(params: {
  userId: string;
  householdId: string;
  scopes?: ("read" | "write")[];
  name?: string;
  oauthClientId?: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}) {
  const raw = generateAccessToken();
  const row = await prisma.accessToken.create({
    data: {
      userId: params.userId,
      householdId: params.householdId,
      name: params.name ?? "Test token",
      scopes: params.scopes ?? ["read"],
      tokenHash: hashAccessToken(raw),
      tokenPrefix: tokenPrefix(raw),
      oauthClientId: params.oauthClientId,
      expiresAt: params.expiresAt,
      revokedAt: params.revokedAt,
    },
  });
  return { raw, row };
}

export async function makeOAuthClient(
  overrides: Partial<Parameters<typeof prisma.oAuthClient.create>[0]["data"]> = {},
) {
  return prisma.oAuthClient.create({
    data: {
      clientName: unique("Test client"),
      redirectUris: ["https://client.example.test/callback"],
      tokenEndpointAuthMethod: "none",
      ...overrides,
    },
  });
}
