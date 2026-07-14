import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// This is the flow every real connection to Claude or ChatGPT goes through:
// the assistant registers itself, then sends the user's browser to
// /oauth/authorize, which is server-rendered HTML with no client-side router —
// nothing else in the suite drives it. PKCE (S256) is mandatory under OAuth
// 2.1, so this generates a real verifier/challenge pair rather than faking one.

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function pkcePair() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

// Stands in for the MCP client's redirect endpoint. Real enough to observe the
// query string /oauth/authorize redirects back with (a live loopback server,
// not a guess at what the browser's address bar will show), without needing an
// actual client integration.
async function startCallbackServer() {
  let resolveCallback!: (params: URLSearchParams) => void;
  const received = new Promise<URLSearchParams>((resolve) => {
    resolveCallback = resolve;
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.end("You can close this window.");
    // Chromium may also fetch a favicon or similar off this origin; only the
    // callback path itself should resolve the promise.
    if (url.pathname === "/callback") resolveCallback(url.searchParams);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function registerClient(page: Page, redirectUri: string) {
  const response = await page.request.post("/oauth/register", {
    data: { client_name: "E2E OAuth Test Client", redirect_uris: [redirectUri] },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ client_id: string; token_endpoint_auth_method: string }>;
}

// Drives the inline sign-in and consent screens exactly as a user would: fill
// the login form, land on consent, pick a household from the picker, approve.
async function completeAuthorization(
  page: Page,
  opts: {
    email: string;
    password: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    householdName: string;
    received: Promise<URLSearchParams>;
  },
): Promise<URLSearchParams> {
  const authorizeUrl = `/oauth/authorize?${new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    state: opts.state,
    scope: "read write",
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  })}`;

  await page.goto(authorizeUrl);
  await expect(page.getByRole("heading", { name: "Sign in to Mise" })).toBeVisible();
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password").fill(opts.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Connect E2E OAuth Test Client" }),
  ).toBeVisible();
  await page.getByLabel("Household to connect").selectOption({ label: opts.householdName });

  const [params] = await Promise.all([
    opts.received,
    page.getByRole("button", { name: "Allow access" }).click(),
  ]);
  return params;
}

async function exchangeCode(
  page: Page,
  opts: { clientId: string; redirectUri: string; code: string; codeVerifier: string },
) {
  const response = await page.request.post("/oauth/token", {
    data: {
      grant_type: "authorization_code",
      code: opts.code,
      code_verifier: opts.codeVerifier,
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ access_token: string; refresh_token: string }>;
}

test("register a client, sign in inline, pick a household, approve, and redeem a working token", async ({
  page,
}) => {
  const { email, password } = await signUpAndOnboard(page);

  // A second household so the picker on the consent screen is a real <select>
  // choice rather than the single-household hidden-field shortcut.
  const createdHousehold = await page.request.post("/api/households", {
    data: { name: "E2E OAuth Kitchen", type: "Household" },
  });
  expect(createdHousehold.ok()).toBe(true);
  const household = (await createdHousehold.json()) as { name: string };

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const callback = await startCallbackServer();
  const client = await registerClient(page, callback.redirectUri);
  const { codeVerifier, codeChallenge } = pkcePair();
  const state = crypto.randomBytes(8).toString("hex");

  const params = await completeAuthorization(page, {
    email,
    password,
    clientId: client.client_id,
    redirectUri: callback.redirectUri,
    codeChallenge,
    state,
    householdName: household.name,
    received: callback.received,
  });
  await callback.close();

  expect(params.get("state")).toBe(state);
  const code = params.get("code");
  expect(code).toBeTruthy();

  const tokens = await exchangeCode(page, {
    clientId: client.client_id,
    redirectUri: callback.redirectUri,
    code: code!,
    codeVerifier,
  });
  expect(tokens.access_token).toMatch(/^mise_/);

  const whoami = await page.request.get("/api/auth/me", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(whoami.ok()).toBe(true);
  const whoamiBody = await whoami.json();
  expect(whoamiBody.user.email).toBe(email);
  expect(whoamiBody.household.name).toBe(household.name);
});

// GET /api/auth/me must report the household an OAuth access token was
// actually granted for, not whichever household the user currently has active
// in the web app. This test grants a token for one household, switches the
// active household to a second one, then confirms /me still answers with the
// token's household.
test("GET /api/auth/me reports the household an OAuth token was granted for", async ({
  page,
}) => {
  const { email, password } = await signUpAndOnboard(page);
  const originalMe = await (await page.request.get("/api/auth/me")).json();
  const originalHouseholdName = originalMe.household.name as string;

  // Creating a second household makes it the active one, while the token
  // we're about to mint stays bound to the original via the consent form.
  const createdHousehold = await page.request.post("/api/households", {
    data: { name: "E2E Other Kitchen", type: "Household" },
  });
  expect(createdHousehold.ok()).toBe(true);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const callback = await startCallbackServer();
  const client = await registerClient(page, callback.redirectUri);
  const { codeVerifier, codeChallenge } = pkcePair();
  const state = crypto.randomBytes(8).toString("hex");

  const params = await completeAuthorization(page, {
    email,
    password,
    clientId: client.client_id,
    redirectUri: callback.redirectUri,
    codeChallenge,
    state,
    householdName: originalHouseholdName,
    received: callback.received,
  });
  await callback.close();

  const code = params.get("code")!;
  const tokens = await exchangeCode(page, {
    clientId: client.client_id,
    redirectUri: callback.redirectUri,
    code,
    codeVerifier,
  });

  const whoami = await page.request.get("/api/auth/me", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(whoami.ok()).toBe(true);
  const whoamiBody = await whoami.json();
  expect(whoamiBody.household.name).toBe(originalHouseholdName);
});
