import { Router } from "express";
import { loginSchema, signupSchema } from "common";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import {
  COOKIE_NAME,
  cookieOptions,
  hashPassword,
  signToken,
  verifyPassword,
} from "../lib/auth.js";
import { buildMe } from "../lib/household.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const AVATAR_COLORS = [
  "oklch(0.62 0.16 42)",
  "oklch(0.55 0.12 200)",
  "oklch(0.58 0.14 140)",
  "oklch(0.6 0.15 280)",
  "oklch(0.6 0.16 20)",
  "oklch(0.58 0.13 320)",
];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

// New users start without a household and are sent through onboarding to create
// one (see routes/onboarding.ts).
authRouter.post("/signup", async (req, res) => {
  const { name, email, password } = signupSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, displayName: name, passwordHash, avatarColor: pickColor() },
  });

  res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions);
  res.status(201).json(await buildMe(user.id));
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, "Invalid email or password");
  }

  res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions);
  res.json(await buildMe(user.id));
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await buildMe(req.user!.id, req.user!.householdId));
});
