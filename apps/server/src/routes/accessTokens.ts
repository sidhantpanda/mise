import { Router } from "express";
import { accessTokenCreateSchema } from "common";
import { AppError } from "../lib/AppError.js";
import {
  generateAccessToken,
  hashAccessToken,
  toAccessTokenDTO,
  tokenPrefix,
} from "../lib/accessTokens.js";
import { routeParam } from "../lib/request.js";
import { requireWritableAccount } from "../middleware/auth.js";
import { prisma } from "../prisma.js";

export const accessTokensRouter = Router();

accessTokensRouter.get("/", async (req, res) => {
  const tokens = await prisma.accessToken.findMany({
    where: { userId: req.user!.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { household: { select: { id: true, name: true } } },
  });
  res.json(tokens.map(toAccessTokenDTO));
});

accessTokensRouter.post("/", requireWritableAccount, async (req, res) => {
  if (!req.user!.householdId) throw new AppError(403, "No active household");
  const input = accessTokenCreateSchema.parse(req.body);
  const token = generateAccessToken();
  const accessToken = await prisma.accessToken.create({
    data: {
      userId: req.user!.id,
      householdId: req.user!.householdId,
      name: input.name,
      scopes: [...new Set(input.scopes)],
      tokenHash: hashAccessToken(token),
      tokenPrefix: tokenPrefix(token),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    include: { household: { select: { id: true, name: true } } },
  });

  res.status(201).json({ ...toAccessTokenDTO(accessToken), token });
});

accessTokensRouter.delete("/:id", requireWritableAccount, async (req, res) => {
  const id = routeParam(req.params.id, "Access token id");
  const token = await prisma.accessToken.findFirst({
    where: { id, userId: req.user!.id },
    select: { id: true, revokedAt: true },
  });
  if (!token) throw new AppError(404, "Access token not found");

  if (!token.revokedAt) {
    await prisma.accessToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  res.json({ ok: true });
});
