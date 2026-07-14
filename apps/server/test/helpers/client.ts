import { beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { makeAccessToken, makeUserWithHousehold, uniqueEmail } from "./factories.js";

let app: Express;

export function getApp(): Express {
  if (!app) throw new Error("getApp() called before beforeAll built the app — call setUpClient() at file scope.");
  return app;
}

// Builds the Express app once per test file via createApiApp() (which is why this
// must be called from a test file's top level, not inside a single test — the
// app is expensive to construct and every test in the file shares it).
export function setUpClient(): void {
  beforeAll(async () => {
    const { createApiApp } = await import("../../src/app.js");
    app = await createApiApp();
  });
}

export type SignedUpUser = {
  agent: ReturnType<typeof request.agent>;
  email: string;
  password: string;
  me: Record<string, unknown>;
};

// Signs up a fresh user with a unique email and returns an agent carrying the
// session cookie, so subsequent calls on `agent` are authenticated.
export async function signup(overrides: { name?: string } = {}): Promise<SignedUpUser> {
  const agent = request.agent(getApp());
  const email = uniqueEmail();
  const password = "password123";
  const res = await agent
    .post("/api/auth/signup")
    .send({ name: overrides.name ?? "Test User", email, password })
    .expect(201);
  return { agent, email, password, me: res.body };
}

export type SignedUpUserWithHousehold = SignedUpUser & { household: Record<string, unknown> };

// Signs up and creates a household, returning an agent already scoped to it.
export async function withHousehold(
  overrides: { name?: string; householdName?: string } = {},
): Promise<SignedUpUserWithHousehold> {
  const user = await signup(overrides);
  const res = await user.agent
    .post("/api/households")
    .send({ name: overrides.householdName ?? "Test Household", type: "Household" })
    .expect(201);
  return { ...user, household: res.body };
}

// Mints a real AccessToken row (bypassing the API, same as a user would get from
// settings or the OAuth flow) and returns the raw bearer value plus the
// user/household it belongs to. Pass an existing user/household to scope it to
// state a test already set up; otherwise a fresh one is created.
export async function bearer(
  params: {
    scopes?: ("read" | "write")[];
    userId?: string;
    householdId?: string;
  } = {},
): Promise<{ token: string; userId: string; householdId: string }> {
  let userId = params.userId;
  let householdId = params.householdId;
  if (!userId || !householdId) {
    const { user, household } = await makeUserWithHousehold();
    userId = userId ?? user.id;
    householdId = householdId ?? household.id;
  }
  const { raw } = await makeAccessToken({ userId, householdId, scopes: params.scopes ?? ["read"] });
  return { token: raw, userId, householdId };
}
