import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toPantryDTO } from "../lib/mappers.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";

export const pantryRouter = Router();

const location = z.enum(["Pantry", "Fridge", "Freezer"]);

const quantity = z.object({
  value: z.number(),
  unitText: z.string(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().default(""),
  quantity: quantity.default({ value: 0, unitText: "" }),
  expires: z.string().nullish(),
  location: location.default("Pantry"),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1),
    category: z.string(),
    quantity,
    expires: z.string().nullable(),
    location,
  })
  .partial();

pantryRouter.get("/", async (req, res) => {
  const items = await prisma.pantryItem.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map(toPantryDTO));
});

pantryRouter.post("/", requireWriteAuth, async (req, res) => {
  const input = createSchema.parse(req.body);
  const item = await prisma.pantryItem.create({
    data: {
      householdId: req.user!.householdId,
      name: input.name,
      category: input.category,
      quantityValue: input.quantity.value,
      quantityUnit: input.quantity.unitText,
      expires: input.expires ?? null,
      location: input.location,
    },
  });
  res.status(201).json(toPantryDTO(item));
});

pantryRouter.patch("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Pantry item id");
  const input = updateSchema.parse(req.body);
  const existing = await prisma.pantryItem.findFirst({
    where: { id, householdId: req.user!.householdId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Pantry item not found");
  const item = await prisma.pantryItem.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.quantity !== undefined
        ? { quantityValue: input.quantity.value, quantityUnit: input.quantity.unitText }
        : {}),
      ...(input.expires !== undefined ? { expires: input.expires } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
    },
  });
  res.json(toPantryDTO(item));
});

pantryRouter.delete("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Pantry item id");
  const { count } = await prisma.pantryItem.deleteMany({
    where: { id, householdId: req.user!.householdId },
  });
  if (count === 0) throw new AppError(404, "Pantry item not found");
  res.json({ ok: true });
});
