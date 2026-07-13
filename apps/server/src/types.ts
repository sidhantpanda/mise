// Augment Express's Request with the authenticated user set by requireAuth.
import "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; householdId: string };
      auth?: { type: "session" | "accessToken"; tokenId?: string; scopes: string[] };
      // Set on the MCP endpoint: a 401 from requireAuth must advertise the OAuth
      // resource metadata so an MCP client can discover how to authenticate.
      oauthResourceMetadataUrl?: string;
    }
  }
}

export {};
