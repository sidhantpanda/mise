import type { NextFunction, Request, Response } from "express";
import { COOKIE_NAME, verifyToken } from "../lib/auth.js";
import { hashAccessToken } from "../lib/accessTokens.js";
import { getActiveHouseholdId } from "../lib/household.js";
import { protectedResourceMetadataUrl } from "../lib/oauth.js";
import { prisma } from "../prisma.js";

// Marks a route as an OAuth protected resource. Its 401s then carry the
// `WWW-Authenticate` challenge that points an MCP client at our resource metadata —
// the entry point of the whole discovery chain that ends in a "Connect" button.
export function oauthProtectedResource(req: Request, _res: Response, next: NextFunction): void {
  req.oauthResourceMetadataUrl = protectedResourceMetadataUrl();
  next();
}

function unauthorized(req: Request, res: Response, error: string, description: string): void {
  if (req.oauthResourceMetadataUrl) {
    res.set(
      "WWW-Authenticate",
      `Bearer error="${error}", error_description="${description}", resource_metadata="${req.oauthResourceMetadataUrl}"`,
    );
  }
  res.status(401).json({ error: description });
}

// Authenticates the request and attaches the user's primary household id (empty
// string when they have none yet). Async rejections propagate to the Express 5
// error handler.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const token = await prisma.accessToken.findUnique({
      where: { tokenHash: hashAccessToken(bearer) },
    });
    const now = new Date();
    if (!token || token.revokedAt || (token.expiresAt && token.expiresAt <= now)) {
      // "invalid_token" is what tells an OAuth client to refresh and retry rather
      // than give up — OAuth access tokens expire on a 24h clock.
      unauthorized(req, res, "invalid_token", "Invalid or expired access token");
      return;
    }

    const membership = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId: token.householdId, userId: token.userId } },
      select: { householdId: true },
    });
    if (!membership) {
      res.status(403).json({ error: "Token owner is no longer a household member" });
      return;
    }

    await prisma.accessToken.update({
      where: { id: token.id },
      data: { lastUsedAt: now },
    });
    req.user = { id: token.userId, householdId: token.householdId };
    req.auth = { type: "accessToken", tokenId: token.id, scopes: token.scopes };
    next();
    return;
  }

  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    unauthorized(req, res, "invalid_token", "Not authenticated");
    return;
  }
  req.user = { id: payload.id, householdId: (await getActiveHouseholdId(payload.id)) ?? "" };
  req.auth = { type: "session", scopes: ["read", "write"] };
  next();
}

// Guards writes for access-token callers. Session-authenticated web users keep
// full access; integrations need an explicit "write" scope.
export function requireWriteAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.type === "accessToken" && !req.auth.scopes.includes("write")) {
    res.status(403).json({ error: "Access token is read-only" });
    return;
  }
  next();
}

// Token-management endpoints should be reached by a logged-in user in the web
// session, not by another access token.
export function requireSessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.type !== "session") {
    res.status(403).json({ error: "Session authentication required" });
    return;
  }
  next();
}

// Guards routes that operate on a household; users still in onboarding (no
// household) get a 403 so the client can route them to the onboarding flow.
export function requireHousehold(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.householdId) {
    res.status(403).json({ error: "No household" });
    return;
  }
  next();
}
