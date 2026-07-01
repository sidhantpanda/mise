// Augment Express's Request with the authenticated user set by requireAuth.
import "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; householdId: string };
      auth?: { type: "session" | "accessToken"; tokenId?: string; scopes: string[] };
    }
  }
}

export {};
