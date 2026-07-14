import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { getApp, setUpClient } from "../helpers/client.js";
import { makeAccessToken, makeHousehold, makeUserWithHousehold, uniqueEmail } from "../helpers/factories.js";

setUpClient();

describe("POST /api/auth/signup", () => {
  it("sets an httpOnly cookie and returns the me payload with household: null", async () => {
    const agent = request.agent(getApp());
    const email = uniqueEmail();
    const res = await agent
      .post("/api/auth/signup")
      .send({ name: "Ada Lovelace", email, password: "password123" })
      .expect(201);

    expect(res.body.household).toBeNull();
    expect(res.body.user.email).toBe(email);
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("never returns passwordHash in the response body", async () => {
    const agent = request.agent(getApp());
    const res = await agent
      .post("/api/auth/signup")
      .send({ name: "Ada", email: uniqueEmail(), password: "password123" })
      .expect(201);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects a duplicate email with 409", async () => {
    const email = uniqueEmail();
    const agent = request.agent(getApp());
    await agent.post("/api/auth/signup").send({ name: "A", email, password: "password123" }).expect(201);

    const again = request.agent(getApp());
    await again
      .post("/api/auth/signup")
      .send({ name: "B", email, password: "password123" })
      .expect(409);
  });
});

describe("POST /api/auth/login", () => {
  it("matches email case-insensitively", async () => {
    const email = uniqueEmail();
    const signupAgent = request.agent(getApp());
    await signupAgent
      .post("/api/auth/signup")
      .send({ name: "Ada", email, password: "password123" })
      .expect(201);

    const loginAgent = request.agent(getApp());
    await loginAgent
      .post("/api/auth/login")
      .send({ email: email.toUpperCase(), password: "password123" })
      .expect(200);
  });

  it("returns the same 401 message for a wrong password and an unknown email", async () => {
    const email = uniqueEmail();
    const signupAgent = request.agent(getApp());
    await signupAgent
      .post("/api/auth/signup")
      .send({ name: "Ada", email, password: "password123" })
      .expect(201);

    const wrongPassword = await request
      .agent(getApp())
      .post("/api/auth/login")
      .send({ email, password: "wrong-password" })
      .expect(401);
    const unknownEmail = await request
      .agent(getApp())
      .post("/api/auth/login")
      .send({ email: uniqueEmail(), password: "wrong-password" })
      .expect(401);

    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it("never returns passwordHash", async () => {
    const email = uniqueEmail();
    await request
      .agent(getApp())
      .post("/api/auth/signup")
      .send({ name: "Ada", email, password: "password123" })
      .expect(201);
    const res = await request
      .agent(getApp())
      .post("/api/auth/login")
      .send({ email, password: "password123" })
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

describe("GET /api/auth/me", () => {
  it("401s without a cookie", async () => {
    await request(getApp()).get("/api/auth/me").expect(401);
  });

  it("401s for a JWT signed with a different secret", async () => {
    const forged = jwt.sign({ sub: "someone" }, "wrong-secret", { expiresIn: "1h" });
    await request(getApp()).get("/api/auth/me").set("Cookie", `token=${forged}`).expect(401);
  });

  it("401s for a tampered JWT", async () => {
    const res = await request(getApp())
      .post("/api/auth/signup")
      .send({ name: "Ada", email: uniqueEmail(), password: "password123" })
      .expect(201);
    const setCookie = res.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const [name, value] = raw!.split(";")[0]!.split("=");
    const tampered = `${name}=${value}tampered`;
    await request(getApp()).get("/api/auth/me").set("Cookie", tampered).expect(401);
  });
});

describe("GET /api/auth/me household resolution", () => {
  it("an access token reports the household it was granted for, not the caller's active one", async () => {
    const { user, household: householdA } = await makeUserWithHousehold();
    // Joining a second household as its owner makes it the user's active
    // household, while the token minted below stays bound to householdA.
    const householdB = await makeHousehold({ ownerId: user.id, setActive: true });
    const { raw: tokenForA } = await makeAccessToken({ userId: user.id, householdId: householdA.id });

    const res = await request(getApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tokenForA}`)
      .expect(200);
    expect(res.body.household.id).toBe(householdA.id);
    expect(res.body.household.id).not.toBe(householdB.id);
  });

  it("a session cookie still reports the caller's active household", async () => {
    const { user, household: householdA } = await makeUserWithHousehold();
    const householdB = await makeHousehold({ ownerId: user.id, setActive: true });

    const agent = request.agent(getApp());
    await agent.post("/api/auth/login").send({ email: user.email, password: "password123" }).expect(200);

    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body.household.id).toBe(householdB.id);
    expect(res.body.household.id).not.toBe(householdA.id);
  });

  it("reports household: null for a user still in onboarding", async () => {
    const agent = request.agent(getApp());
    await agent
      .post("/api/auth/signup")
      .send({ name: "Onboarding User", email: uniqueEmail(), password: "password123" })
      .expect(201);

    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body.household).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie", async () => {
    const agent = request.agent(getApp());
    await agent
      .post("/api/auth/signup")
      .send({ name: "Ada", email: uniqueEmail(), password: "password123" })
      .expect(201);
    const res = await agent.post("/api/auth/logout").expect(200);
    const setCookie = res.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toMatch(/token=;/);

    await agent.get("/api/auth/me").expect(401);
  });
});
