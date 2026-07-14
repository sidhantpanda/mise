import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { getApp, setUpClient, withHousehold } from "../helpers/client.js";
import { prisma } from "../../src/prisma.js";
import { sha256 } from "../../src/lib/oauth.js";

setUpClient();

const REDIRECT_URI = "https://client.example.test/callback";

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(overrides: Record<string, unknown> = {}) {
  const res = await request(getApp())
    .post("/oauth/register")
    .send({
      client_name: "Test Client",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      ...overrides,
    })
    .expect(201);
  return res.body as {
    client_id: string;
    client_secret?: string;
    scope: string;
    token_endpoint_auth_method: string;
  };
}

async function authorizeAndApprove(params: {
  agent: ReturnType<typeof request.agent>;
  clientId: string;
  householdId: string;
  challenge: string;
  redirectUri?: string;
  state?: string;
  scope?: string;
}) {
  const query: Record<string, string> = {
    client_id: params.clientId,
    redirect_uri: params.redirectUri ?? REDIRECT_URI,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state ?? "xyz",
  };
  if (params.scope) query.scope = params.scope;
  await params.agent.get("/oauth/authorize").query(query).expect(200);

  return params.agent
    .post("/oauth/authorize")
    .type("form")
    .send({ ...query, household_id: params.householdId, action: "approve" });
}

function codeFromRedirect(location: string): string {
  return new URL(location, REDIRECT_URI).searchParams.get("code")!;
}

describe("OAuth 2.1 happy path", () => {
  it("register -> authorize -> approve -> token -> works on /mcp and the REST API", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();

    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    expect(approveRes.status).toBe(302);
    const code = codeFromRedirect(approveRes.headers.location);
    expect(code).toBeTruthy();

    const tokenRes = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: client.client_id,
      })
      .expect(200);
    expect(tokenRes.body.access_token).toMatch(/^mise_/);
    expect(tokenRes.body.refresh_token).toBeTruthy();

    const apiRes = await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
      .expect(200);
    expect(apiRes.body).toEqual([]);

    const mcpRes = await request(getApp())
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(mcpRes.status).toBe(200);
  });
});

describe("code replay", () => {
  it("redeeming the same code twice fails and revokes every token the first redemption produced", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);

    const exchange = () =>
      request(getApp())
        .post("/oauth/token")
        .type("form")
        .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id });

    const first = await exchange().expect(200);
    const accessToken = first.body.access_token;

    await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const second = await exchange().expect(400);
    expect(second.body.error).toBe("invalid_grant");

    // The single most important OAuth assertion in this file: the first
    // redemption's access token must now be dead.
    await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
  });
});

describe("PKCE", () => {
  it("a wrong code_verifier gets invalid_grant", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const { challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);

    const res = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        code,
        code_verifier: "totally-wrong-verifier",
        client_id: client.client_id,
      })
      .expect(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("code_challenge_method=plain is rejected at /authorize", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const res = await user.agent
      .get("/oauth/authorize")
      .query({
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: "some-challenge",
        code_challenge_method: "plain",
        state: "abc",
      })
      .expect(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });
});

describe("redirect URI", () => {
  it("an unregistered redirect_uri renders an error page rather than redirecting", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const { challenge } = pkcePair();
    const res = await user.agent
      .get("/oauth/authorize")
      .query({
        client_id: client.client_id,
        redirect_uri: "https://not-registered.example.test/cb",
        code_challenge: challenge,
        code_challenge_method: "S256",
      })
      .expect(400);
    expect(res.status).not.toBe(302);
    expect(res.text).toContain("redirect URI");
  });

  it("a redirect_uri at the token endpoint that doesn't match the code's gets invalid_grant", async () => {
    const client = await registerClient({ redirect_uris: [REDIRECT_URI, "https://client.example.test/other"] });
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);

    const res = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: client.client_id,
        redirect_uri: "https://client.example.test/other",
      })
      .expect(400);
    expect(res.body.error).toBe("invalid_grant");
  });
});

describe("client confusion", () => {
  it("client B cannot redeem a code issued to client A", async () => {
    const clientA = await registerClient();
    const clientB = await registerClient();
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: clientA.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);

    const res = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: clientB.client_id,
      })
      .expect(400);
    expect(res.body.error).toBe("invalid_grant");
  });
});

describe("expiry", () => {
  it("an expired code gets invalid_grant", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);
    await prisma.oAuthAuthorizationCode.update({
      where: { codeHash: sha256(code) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id })
      .expect(400);
    expect(res.body.error).toBe("invalid_grant");
  });
});

describe("scope", () => {
  it("a read-only client cannot obtain write, even by asking for it at /authorize", async () => {
    const client = await registerClient({ scope: "read" });
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
      scope: "read write",
    });
    const code = codeFromRedirect(approveRes.headers.location);

    const tokenRes = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id })
      .expect(200);
    expect(tokenRes.body.scope).toBe("read");

    await request(getApp())
      .post("/api/recipes")
      .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
      .send({ name: "Should be blocked" })
      .expect(403);
  });
});

describe("consent binding", () => {
  it("approving with a household_id the user doesn't belong to renders an error page and issues no code", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const other = await withHousehold();
    const { challenge } = pkcePair();

    const res = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: other.household.id as string,
      challenge,
    });
    expect(res.status).not.toBe(302);
    expect(res.status).toBe(400);
  });
});

describe("refresh rotation", () => {
  async function issueTokenPair() {
    const client = await registerClient();
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);
    const tokenRes = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id })
      .expect(200);
    return { client, user, ...tokenRes.body };
  }

  it("revokes the old refresh token and its access token, and returns new ones", async () => {
    const { client, access_token: accessToken, refresh_token: refreshToken } = await issueTokenPair();

    const refreshed = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.client_id })
      .expect(200);
    expect(refreshed.body.access_token).not.toBe(accessToken);
    expect(refreshed.body.refresh_token).not.toBe(refreshToken);

    await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
    await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${refreshed.body.access_token}`)
      .expect(200);
  });

  it("reusing the old refresh token gets invalid_grant", async () => {
    const { client, refresh_token: refreshToken } = await issueTokenPair();
    await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.client_id })
      .expect(200);

    const reused = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.client_id })
      .expect(400);
    expect(reused.body.error).toBe("invalid_grant");
  });

  it("refreshing after the user leaves the household gets invalid_grant", async () => {
    const { client, user, refresh_token: refreshToken } = await issueTokenPair();
    await prisma.householdMember.delete({
      where: {
        householdId_userId: {
          householdId: user.household.id as string,
          userId: (user.me as { user: { id: string } }).user.id,
        },
      },
    });

    const res = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.client_id })
      .expect(400);
    expect(res.body.error).toBe("invalid_grant");
  });
});

describe("registration", () => {
  it("a non-https, non-loopback redirect_uri gets 400 invalid_redirect_uri", async () => {
    const res = await request(getApp())
      .post("/oauth/register")
      .send({ redirect_uris: ["http://evil.example.test/cb"] })
      .expect(400);
    expect(res.body.error).toBe("invalid_redirect_uri");
  });

  it('token_endpoint_auth_method: "none" issues no client secret', async () => {
    const client = await registerClient({ token_endpoint_auth_method: "none" });
    expect(client.client_secret).toBeUndefined();
  });

  it("a confidential client's secret is verified at /token, and a wrong secret gets 401", async () => {
    const res = await request(getApp())
      .post("/oauth/register")
      .send({
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: "client_secret_post",
      })
      .expect(201);
    expect(res.body.client_secret).toBeTruthy();

    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: res.body.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);

    const wrongSecret = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: res.body.client_id,
        client_secret: "wrong-secret",
      })
      .expect(401);
    expect(wrongSecret.body.error).toBe("invalid_client");
  });
});

describe("revocation", () => {
  it("POST /oauth/revoke invalidates the token", async () => {
    const client = await registerClient();
    const user = await withHousehold();
    const { verifier, challenge } = pkcePair();
    const approveRes = await authorizeAndApprove({
      agent: user.agent,
      clientId: client.client_id,
      householdId: user.household.id as string,
      challenge,
    });
    const code = codeFromRedirect(approveRes.headers.location);
    const tokenRes = await request(getApp())
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id })
      .expect(200);

    await request(getApp())
      .post("/oauth/revoke")
      .type("form")
      .send({ token: tokenRes.body.access_token })
      .expect(200);

    await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${tokenRes.body.access_token}`)
      .expect(401);
  });

  it("revoking an unknown token still returns 200 {} (no existence oracle)", async () => {
    const res = await request(getApp())
      .post("/oauth/revoke")
      .type("form")
      .send({ token: "mise_totally-unknown-token" })
      .expect(200);
    expect(res.body).toEqual({});
  });
});

describe("discovery", () => {
  it("serves both metadata documents at the bare path and with /mcp appended, built from WEB_ORIGIN", async () => {
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/mcp",
    ]) {
      const res = await request(getApp()).get(path).expect(200);
      expect(res.body.issuer).toBe("http://localhost:3000");
      expect(res.body.authorization_endpoint).toBe("http://localhost:3000/oauth/authorize");
    }
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const res = await request(getApp()).get(path).expect(200);
      expect(res.body.resource).toBe("http://localhost:3000/mcp");
    }
  });
});

describe("CORS", () => {
  it("/mcp, /.well-known/*, and public /oauth/* endpoints answer cross-origin without credentials", async () => {
    const origin = "https://third-party.example.test";
    const res = await request(getApp())
      .get("/.well-known/oauth-authorization-server")
      .set("Origin", origin)
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.headers["access-control-expose-headers"]).toContain("WWW-Authenticate");
  });

  it("/api/* does not reflect an arbitrary origin", async () => {
    const origin = "https://third-party.example.test";
    const res = await request(getApp()).get("/api/health").set("Origin", origin).expect(200);
    expect(res.headers["access-control-allow-origin"]).not.toBe(origin);
  });
});
