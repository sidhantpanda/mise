import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export const COOKIE_NAME = "token";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type TokenPayload = { sub: string };

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// The token only identifies the user; household membership is looked up per
// request (a user may have no household until they finish onboarding).
export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyToken(token: string): { id: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    if (!decoded?.sub) return null;
    return { id: decoded.sub };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge: MAX_AGE_MS,
  path: "/",
};
