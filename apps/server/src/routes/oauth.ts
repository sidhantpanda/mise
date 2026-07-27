import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { OAuthClient } from "@prisma/client";
import { prisma } from "../prisma.js";
import { COOKIE_NAME, cookieOptions, signToken, verifyPassword, verifyToken } from "../lib/auth.js";
import { generateAccessToken, hashAccessToken, tokenPrefix } from "../lib/accessTokens.js";
import { getActiveHouseholdId, getUserHouseholds } from "../lib/household.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_SECONDS,
  OAUTH_SCOPES,
  REFRESH_TOKEN_TTL_SECONDS,
  authorizationServerMetadata,
  constantTimeEquals,
  isAllowedRedirectUri,
  isRegisteredRedirectUri,
  parseScopes,
  protectedResourceMetadata,
  randomToken,
  redirectWith,
  sha256,
  verifyPkce,
} from "../lib/oauth.js";
import {
  renderConsentPage,
  renderErrorPage,
  renderLoginPage,
  type ConsentParams,
} from "../lib/oauthPage.js";

// The OAuth 2.1 authorization server that fronts the MCP endpoint. All of it is
// public (no requireAuth): clients register and fetch tokens anonymously, and the
// only step that needs a user is /oauth/authorize, which authenticates with the
// normal Mise session cookie — signing the user in inline when there isn't one.
export const oauthRouter = Router();

// --- discovery ---------------------------------------------------------------

// Served at both the bare path and with the resource path appended: clients derive
// the URL differently depending on which spec revision they implement.
export const wellKnownRouter = Router();

wellKnownRouter.get(
  ["/oauth-authorization-server", "/oauth-authorization-server/mcp"],
  (_req, res) => {
    res.json(authorizationServerMetadata());
  },
);

wellKnownRouter.get(["/oauth-protected-resource", "/oauth-protected-resource/mcp"], (_req, res) => {
  res.json(protectedResourceMetadata());
});

// --- dynamic client registration (RFC 7591) ----------------------------------

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .optional(),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
});

// Open registration is what makes one-click connect work: Claude and ChatGPT
// register themselves the first time a user connects, so there are no client IDs to
// issue by hand. Registering grants nothing on its own — a client can't touch data
// until a signed-in user approves it on the consent screen.
oauthRouter.post("/register", async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "redirect_uris is required and must contain valid absolute URLs",
    });
    return;
  }
  const input = parsed.data;

  const invalid = input.redirect_uris.filter((uri) => !isAllowedRedirectUri(uri));
  if (invalid.length > 0) {
    res.status(400).json({
      error: "invalid_redirect_uri",
      error_description: `Redirect URIs must be https, or http on localhost: ${invalid.join(", ")}`,
    });
    return;
  }

  const authMethod = input.token_endpoint_auth_method ?? "none";
  const secret = authMethod === "none" ? null : randomToken(32);

  const client = await prisma.oAuthClient.create({
    data: {
      clientName: input.client_name ?? "MCP client",
      redirectUris: input.redirect_uris,
      grantTypes: input.grant_types ?? ["authorization_code", "refresh_token"],
      responseTypes: input.response_types ?? ["code"],
      scopes: parseScopes(input.scope, [...OAUTH_SCOPES]),
      tokenEndpointAuthMethod: authMethod,
      clientSecretHash: secret ? await bcrypt.hash(secret, 10) : null,
      clientUri: input.client_uri ?? null,
      logoUri: input.logo_uri ?? null,
    },
  });

  res.status(201).json({
    client_id: client.id,
    ...(secret ? { client_secret: secret } : {}),
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    scope: client.scopes.join(" "),
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
  });
});

// --- authorization endpoint --------------------------------------------------

const authorizeSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  response_type: z.string().optional(),
  state: z.string().optional(),
  scope: z.string().optional(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.string().optional(),
  resource: z.string().optional(),
});

type AuthorizeInput = z.infer<typeof authorizeSchema>;

// `fatal` renders an error page here; `redirect` sends the error back to the client.
type AuthorizeResult =
  | { ok: true; client: OAuthClient; params: ConsentParams; scopes: string[] }
  | { ok: false; fatal?: string; redirect?: string };

// Validate everything we can before showing the user anything. Errors split in two:
// if we can't trust the client or its redirect_uri we must render the failure
// ourselves (redirecting an unverified URI is an open redirect); once the redirect
// is known-good, protocol errors go back to the client as the spec requires.
async function validateAuthorizeRequest(query: unknown): Promise<AuthorizeResult> {
  const parsed = authorizeSchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, fatal: "Missing or invalid authorization parameters." };
  }
  const input: AuthorizeInput = parsed.data;

  const client = await prisma.oAuthClient.findUnique({ where: { id: input.client_id } });
  if (!client) {
    return { ok: false, fatal: "Unknown client. Try removing and re-adding the connector." };
  }
  if (!isRegisteredRedirectUri(input.redirect_uri, client.redirectUris)) {
    return { ok: false, fatal: "The redirect URI does not match this client's registration." };
  }

  const redirectError = (error: string, description: string): AuthorizeResult => ({
    ok: false,
    redirect: redirectWith(input.redirect_uri, {
      error,
      error_description: description,
      state: input.state,
    }),
  });

  if ((input.response_type ?? "code") !== "code") {
    return redirectError(
      "unsupported_response_type",
      "Only the authorization code flow is supported",
    );
  }
  // OAuth 2.1: PKCE is mandatory and "plain" is not acceptable.
  if ((input.code_challenge_method ?? "S256") !== "S256") {
    return redirectError("invalid_request", "code_challenge_method must be S256");
  }

  const scopes = parseScopes(input.scope, client.scopes);
  if (scopes.length === 0) {
    return redirectError("invalid_scope", "No requested scope is available to this client");
  }

  const params: ConsentParams = {
    clientId: client.id,
    redirectUri: input.redirect_uri,
    state: input.state,
    scope: scopes.join(" "),
    codeChallenge: input.code_challenge,
    codeChallengeMethod: "S256",
    resource: input.resource,
  };
  return { ok: true, client, params, scopes };
}

function renderFailure(res: Response, result: { fatal?: string; redirect?: string }): void {
  if (result.redirect) {
    res.redirect(result.redirect);
    return;
  }
  res
    .status(400)
    .type("html")
    .send(renderErrorPage(result.fatal ?? "This authorization request is not valid."));
}

// The session cookie rides along on this top-level navigation (SameSite=Lax), so a
// user already signed in to Mise goes straight to consent.
function sessionUserId(req: Request): string | null {
  const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  return token ? (verifyToken(token)?.id ?? null) : null;
}

async function renderStep(
  userId: string | null,
  clientName: string,
  clientUri: string | null,
  params: ConsentParams,
  scopes: string[],
  error?: string,
): Promise<string> {
  if (!userId) return renderLoginPage(params, { clientName, error });

  const households = await getUserHouseholds(userId);
  if (households.length === 0) {
    return renderErrorPage(
      "Your Mise account isn't part of a household yet. Open Mise, finish setting up your kitchen, then connect again.",
    );
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const defaultHouseholdId = (await getActiveHouseholdId(userId)) ?? households[0]!.id;

  return renderConsentPage(params, {
    clientName,
    clientUri,
    userEmail: user?.email ?? "",
    households,
    defaultHouseholdId,
    scopes,
  });
}

oauthRouter.get("/authorize", async (req, res) => {
  const result = await validateAuthorizeRequest(req.query);
  if (!result.ok) return renderFailure(res, result);

  const userId = sessionUserId(req);
  res
    .type("html")
    .send(
      await renderStep(
        userId,
        result.client.clientName,
        result.client.clientUri,
        result.params,
        result.scopes,
      ),
    );
});

// The consent form posts back here. Same-origin form + SameSite=Lax cookies means a
// cross-site page can't forge this: its POST would arrive without the session cookie.
oauthRouter.post("/authorize", async (req, res) => {
  const result = await validateAuthorizeRequest(req.body);
  if (!result.ok) return renderFailure(res, result);
  const { client, params, scopes } = result;
  const body = req.body as Record<string, string>;

  if (body.action === "deny") {
    return res.redirect(
      redirectWith(params.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the request",
        state: params.state,
      }),
    );
  }

  // Inline sign-in: authenticate, set the normal session cookie, then fall through
  // to the consent step of the same request.
  let userId = sessionUserId(req);
  if (body.action === "login") {
    const email = (body.email ?? "").trim().toLowerCase();
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !(await verifyPassword(body.password ?? "", user.passwordHash))) {
      return res
        .status(401)
        .type("html")
        .send(
          await renderStep(
            null,
            client.clientName,
            client.clientUri,
            params,
            scopes,
            "Invalid email or password.",
          ),
        );
    }
    res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions);
    userId = user.id;
    return res
      .type("html")
      .send(await renderStep(userId, client.clientName, client.clientUri, params, scopes));
  }

  if (!userId) {
    return res
      .status(401)
      .type("html")
      .send(await renderStep(null, client.clientName, client.clientUri, params, scopes));
  }

  if (body.action !== "approve") {
    return res.status(400).type("html").send(renderErrorPage("Unexpected form submission."));
  }

  // The household the connection may act on. Verified as one this user actually
  // belongs to, so a tampered form can't bind the grant to someone else's kitchen.
  const householdId = body.household_id ?? "";
  const membership = householdId
    ? await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
        select: { householdId: true },
      })
    : null;
  if (!membership) {
    return res.status(400).type("html").send(renderErrorPage("Pick a household you belong to."));
  }

  // A read-only account can consent to a connection, but never to a write-capable
  // one — otherwise the published demo login would be a way to mint a token that
  // writes through /mcp, straight past requireWriteAuth.
  const grantUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isReadOnly: true },
  });
  const grantedScopes = grantUser?.isReadOnly ? scopes.filter((s) => s !== "write") : scopes;

  const code = randomToken(32);
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: sha256(code),
      clientId: client.id,
      userId,
      householdId,
      scopes: grantedScopes,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256",
      resource: params.resource ?? null,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
    },
  });

  res.redirect(redirectWith(params.redirectUri, { code, state: params.state }));
});

// --- token endpoint ----------------------------------------------------------

type TokenErrorBody = { error: string; error_description?: string };

function tokenError(res: Response, status: number, body: TokenErrorBody) {
  res.status(status).json(body);
}

// Client credentials arrive either in the body or as HTTP Basic. Public clients
// (token_endpoint_auth_method "none", which is what Claude and ChatGPT register as)
// send only a client_id and prove themselves with PKCE instead.
function clientCredentials(req: Request): { clientId?: string; clientSecret?: string } {
  const body = (req.body ?? {}) as Record<string, string>;
  const basic = req.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, "base64").toString("utf8").split(":");
    if (id)
      return { clientId: decodeURIComponent(id), clientSecret: decodeURIComponent(secret ?? "") };
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

async function authenticateClient(clientId: string, clientSecret: string | undefined) {
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client) return null;
  if (client.tokenEndpointAuthMethod === "none") return client;
  if (!clientSecret || !client.clientSecretHash) return null;
  return (await bcrypt.compare(clientSecret, client.clientSecretHash)) ? client : null;
}

// Mint the access token (a normal Mise `mise_` bearer token — the same credential
// requireAuth already understands) plus a refresh token to renew it with.
async function issueTokens(grant: {
  clientId: string;
  clientName: string;
  userId: string;
  householdId: string;
  scopes: string[];
}) {
  const accessToken = generateAccessToken();
  const refreshToken = randomToken(32);
  const now = Date.now();

  const created = await prisma.accessToken.create({
    data: {
      userId: grant.userId,
      householdId: grant.householdId,
      name: grant.clientName,
      tokenHash: hashAccessToken(accessToken),
      tokenPrefix: tokenPrefix(accessToken),
      scopes: grant.scopes,
      oauthClientId: grant.clientId,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
    },
  });

  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      clientId: grant.clientId,
      userId: grant.userId,
      householdId: grant.householdId,
      scopes: grant.scopes,
      accessTokenId: created.id,
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: grant.scopes.join(" "),
  };
}

oauthRouter.post("/token", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const { clientId, clientSecret } = clientCredentials(req);

  if (!clientId) {
    return tokenError(res, 400, {
      error: "invalid_client",
      error_description: "client_id is required",
    });
  }
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) {
    return tokenError(res, 401, {
      error: "invalid_client",
      error_description: "Client authentication failed",
    });
  }

  if (body.grant_type === "authorization_code") {
    const { code, code_verifier: codeVerifier, redirect_uri: redirectUri } = body;
    if (!code || !codeVerifier) {
      return tokenError(res, 400, {
        error: "invalid_request",
        error_description: "code and code_verifier are required",
      });
    }

    const stored = await prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash: sha256(code) },
      include: { client: { select: { clientName: true } } },
    });
    if (!stored || stored.clientId !== client.id) {
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "Unknown authorization code",
      });
    }
    // A code that comes back twice means it leaked (or was replayed): burn every
    // token the first redemption produced rather than issuing more.
    if (stored.consumedAt) {
      await prisma.$transaction([
        prisma.oAuthRefreshToken.updateMany({
          where: { userId: stored.userId, clientId: client.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.accessToken.updateMany({
          where: { userId: stored.userId, oauthClientId: client.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "Authorization code has already been used",
      });
    }
    if (stored.expiresAt <= new Date()) {
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "Authorization code has expired",
      });
    }
    if (redirectUri && !constantTimeEquals(redirectUri, stored.redirectUri)) {
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "redirect_uri mismatch",
      });
    }
    if (!verifyPkce(codeVerifier, stored.codeChallenge)) {
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "PKCE verification failed",
      });
    }

    await prisma.oAuthAuthorizationCode.update({
      where: { id: stored.id },
      data: { consumedAt: new Date() },
    });

    return res.json(
      await issueTokens({
        clientId: client.id,
        clientName: stored.client.clientName,
        userId: stored.userId,
        householdId: stored.householdId,
        scopes: stored.scopes,
      }),
    );
  }

  if (body.grant_type === "refresh_token") {
    const presented = body.refresh_token;
    if (!presented) {
      return tokenError(res, 400, {
        error: "invalid_request",
        error_description: "refresh_token is required",
      });
    }

    const stored = await prisma.oAuthRefreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { client: { select: { clientName: true } } },
    });
    if (
      !stored ||
      stored.clientId !== client.id ||
      stored.revokedAt ||
      stored.expiresAt <= new Date()
    ) {
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "Refresh token is invalid or expired",
      });
    }

    // Rotation: the presented refresh token and the access token it minted are
    // retired as part of redeeming it.
    await prisma.$transaction([
      prisma.oAuthRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      ...(stored.accessTokenId
        ? [
            prisma.accessToken.updateMany({
              where: { id: stored.accessTokenId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);

    // Follow the household the user last pointed this connection at, so a
    // set_default_household from the assistant survives a token refresh.
    const latest = await prisma.accessToken.findFirst({
      where: { userId: stored.userId, oauthClientId: client.id },
      orderBy: { createdAt: "desc" },
      select: { householdId: true },
    });
    const householdId = latest?.householdId ?? stored.householdId;
    const stillMember = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: stored.userId } },
      select: { householdId: true },
    });
    if (!stillMember) {
      return tokenError(res, 400, {
        error: "invalid_grant",
        error_description: "The connected household is no longer available",
      });
    }

    return res.json(
      await issueTokens({
        clientId: client.id,
        clientName: stored.client.clientName,
        userId: stored.userId,
        householdId,
        scopes: stored.scopes,
      }),
    );
  }

  return tokenError(res, 400, {
    error: "unsupported_grant_type",
    error_description: "Supported grant types: authorization_code, refresh_token",
  });
});

// --- revocation (RFC 7009) ---------------------------------------------------

oauthRouter.post("/revoke", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const token = body.token;
  // Revocation always reports success — telling a caller whether an unknown token
  // existed is an oracle.
  if (!token) return res.json({});

  await prisma.oAuthRefreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.accessToken.updateMany({
    where: { tokenHash: hashAccessToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  res.json({});
});
