import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MEAL_TYPES, PANTRY_LOCATIONS } from "common";
import { AppError } from "../lib/AppError.js";
import { getUserHouseholds } from "../lib/household.js";
import { toMealDTO, toPantryDTO, toRecipeDTO, toShoppingDTO } from "../lib/mappers.js";
import { createRecipe, withAuthor } from "../lib/recipes.js";
import { isSearchEnabled, searchRecipes } from "../lib/recipeSearch.js";
import { prisma } from "../prisma.js";

// The authenticated caller a per-request MCP server acts on behalf of. Derived from
// the Bearer access token on the /mcp request — issued either by the OAuth flow
// (Claude/ChatGPT "Connect") or created by hand in Mise settings.
export type McpAuthContext = {
  userId: string;
  householdId: string;
  scopes: string[];
  tokenId?: string;
};

type ToolResult = {
  isError?: boolean;
  content: { type: "text"; text: string }[];
};

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ isError: true, content: [{ type: "text", text }] });
const json = (value: unknown): ToolResult => ok(JSON.stringify(value, null, 2));

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO calendar date, e.g. 2026-07-13")
  .describe("Calendar date in YYYY-MM-DD form.");

// Every tool takes an optional householdId so the user can tell the assistant which
// kitchen to act on ("add this to the restaurant's pantry"). Omitted, it's the
// household the connection was authorized for — the only one that exists for most
// users. Any id passed in is checked against the caller's own memberships, so the
// assistant can never be talked into touching a household the user isn't in.
const HOUSEHOLD_ID = z
  .string()
  .optional()
  .describe(
    "Household to act on. Defaults to the connection's household — only pass this to " +
      "target a different one from list_households.",
  );

class ToolError extends Error {}

async function resolveHousehold(ctx: McpAuthContext, householdId?: string): Promise<string> {
  if (!householdId || householdId === ctx.householdId) return ctx.householdId;
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: ctx.userId } },
    select: { householdId: true },
  });
  if (!membership) {
    throw new ToolError(
      "You are not a member of that household. Call list_households to see the ones you can use.",
    );
  }
  return householdId;
}

function requireScope(ctx: McpAuthContext, scope: "read" | "write"): void {
  if (ctx.scopes.includes(scope)) return;
  throw new ToolError(
    scope === "write"
      ? "This connection is read-only. Reconnect Mise granting write access to make changes."
      : "This connection is not permitted to read Mise data.",
  );
}

// One place where a thrown ToolError / AppError becomes a clean, model-readable
// error result instead of a transport-level failure the assistant can't explain.
function tool<Args>(handler: (args: Args) => Promise<ToolResult>) {
  return async (args: Args): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (err) {
      if (err instanceof ToolError || err instanceof AppError) return fail(err.message);
      console.error("MCP tool error:", err);
      return fail("Something went wrong in Mise. Try again.");
    }
  };
}

// Turn the flat tool arguments into a Schema.org Recipe JSON-LD body that
// createRecipe (and recipeInputSchema behind it) understands. A caller-supplied
// schemaJson is used as the base; the structured fields are merged on top.
function buildRecipeBody(args: Record<string, unknown>): Record<string, unknown> {
  const { schemaJson, author, householdId: _householdId, ...fields } = args;
  const base = schemaJson && typeof schemaJson === "object" ? (schemaJson as object) : {};
  const defined = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    ...base,
    ...defined,
    ...(typeof author === "string" && author.length > 0
      ? { author: { "@type": "Person", name: author } }
      : {}),
  };
}

// Build a fresh MCP server bound to one authenticated caller. The handler builds one
// per request, so tool handlers close over the caller's household + scopes with no
// shared state.
export function buildMcpServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer({ name: "mise", version: "0.2.0" }, { capabilities: { tools: {} } });

  // --- households ------------------------------------------------------------

  server.registerTool(
    "list_households",
    {
      title: "List the user's households",
      description:
        "List the Mise households (kitchens) the user belongs to, and which one this " +
        "connection currently acts on by default. Use this when the user mentions a " +
        "different kitchen, or before set_default_household.",
      inputSchema: {},
    },
    tool(async () => {
      requireScope(ctx, "read");
      const households = await getUserHouseholds(ctx.userId);
      return json({
        defaultHouseholdId: ctx.householdId,
        households: households.map((h) => ({
          id: h.id,
          name: h.name,
          type: h.type,
          isDefault: h.id === ctx.householdId,
        })),
      });
    }),
  );

  server.registerTool(
    "set_default_household",
    {
      title: "Set the default household",
      description:
        "Change which household this connection acts on by default, for this and all " +
        "future requests. Use when the user says something like 'work on my restaurant " +
        "from now on'. For a one-off action, pass householdId to that tool instead.",
      inputSchema: {
        householdId: z.string().describe("Household id from list_households."),
      },
    },
    tool(async (args: { householdId: string }) => {
      requireScope(ctx, "write");
      const householdId = await resolveHousehold(ctx, args.householdId);
      if (!ctx.tokenId) {
        throw new ToolError("This connection's household cannot be changed.");
      }
      // Persisted on the access token the caller is using, so it survives across
      // requests (and token refreshes) without touching the household the user has
      // open in the Mise web app.
      await prisma.accessToken.update({
        where: { id: ctx.tokenId },
        data: { householdId },
      });
      ctx.householdId = householdId;
      const household = await prisma.household.findUnique({
        where: { id: householdId },
        select: { name: true },
      });
      return ok(`Mise will now act on "${household?.name ?? householdId}" by default.`);
    }),
  );

  // --- recipes ---------------------------------------------------------------

  server.registerTool(
    "create_recipe",
    {
      title: "Send a recipe to Mise",
      description:
        "Save a recipe to the user's Mise household. Provide the recipe as structured " +
        "fields (name, ingredients, steps) and/or a full Schema.org Recipe JSON-LD object " +
        "via schemaJson. Use this whenever the user asks to send, save, or add a recipe to Mise.",
      inputSchema: {
        // Optional at the schema level so a caller can send a complete Schema.org
        // recipe as schemaJson alone (the "send this recipe to Mise" flow). Marking it
        // required here would make the SDK reject that body before createRecipe could
        // pull the name out of schemaJson; createRecipe still errors if there is no
        // name in either place.
        name: z
          .string()
          .optional()
          .describe("Recipe title. Required unless it is present inside schemaJson."),
        description: z.string().optional().describe("Short description of the dish."),
        recipeIngredient: z
          .array(z.string())
          .optional()
          .describe('Ingredients, one entry each, e.g. "2 cups flour".'),
        recipeInstructions: z
          .array(z.string())
          .optional()
          .describe("Ordered preparation steps, one step per entry."),
        recipeYield: z.string().optional().describe('Servings, e.g. "4 servings".'),
        prepTime: z.string().optional().describe("Prep time as an ISO 8601 duration, e.g. PT20M."),
        cookTime: z.string().optional().describe("Cook time as an ISO 8601 duration, e.g. PT45M."),
        recipeCuisine: z.string().optional().describe('Cuisine, e.g. "Italian".'),
        recipeCategory: z.string().optional().describe('Course, e.g. "Main course".'),
        keywords: z.string().optional().describe("Comma-separated tags."),
        image: z.string().url().optional().describe("URL of a photo of the finished dish."),
        author: z.string().optional().describe("Original recipe author or source name."),
        schemaJson: z
          .record(z.any())
          .optional()
          .describe(
            "A complete Schema.org Recipe JSON-LD object. When supplied it is used as the " +
              "base and the structured fields above are merged on top of it.",
          ),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: Record<string, unknown>) => {
      requireScope(ctx, "write");
      const householdId = await resolveHousehold(ctx, args.householdId as string | undefined);
      const recipe = await createRecipe({
        body: buildRecipeBody(args),
        householdId,
        createdById: ctx.userId,
      });
      return ok(`Saved "${recipe.name}" to Mise (recipe id ${recipe.identifier}).`);
    }),
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Search recipes in Mise",
      description:
        "Search the user's Mise recipe library by name, ingredient, cuisine, category, or " +
        "keyword. Returns matching recipes in relevance order. Use this to find a recipe the " +
        "user already has — then get_recipe for the full detail.",
      inputSchema: {
        query: z.string().describe("Free-text search, e.g. an ingredient, dish name, or cuisine."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of results to return (default 10)."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { query: string; limit?: number; householdId?: string }) => {
      requireScope(ctx, "read");
      const householdId = await resolveHousehold(ctx, args.householdId);

      // Meilisearch is optional in a Mise deployment; fall back to a database
      // contains-match so this tool works on servers that run without it.
      if (!isSearchEnabled()) {
        const recipes = await prisma.recipe.findMany({
          where: { householdId, name: { contains: args.query, mode: "insensitive" } },
          take: args.limit ?? 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, recipeCuisine: true, recipeCategory: true },
        });
        return json({ results: recipes, note: "Search index unavailable; matched on name only." });
      }

      const { hits, total } = await searchRecipes({
        householdId,
        query: args.query,
        limit: args.limit ?? 10,
      });
      return json({
        total,
        results: hits.map((hit) => ({
          id: hit.id,
          name: hit.name,
          description: hit.description,
          recipeCuisine: hit.recipeCuisine,
          recipeCategory: hit.recipeCategory,
        })),
      });
    }),
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Get a recipe from Mise",
      description:
        "Fetch one recipe in full, as Schema.org Recipe JSON-LD (ingredients, instructions, " +
        "times, yield, nutrition). Use after search_recipes or list_recipes to read, " +
        "summarize, scale, or adapt a recipe the user already has.",
      inputSchema: {
        recipeId: z.string().describe("Recipe id from search_recipes or list_recipes."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { recipeId: string; householdId?: string }) => {
      requireScope(ctx, "read");
      const householdId = await resolveHousehold(ctx, args.householdId);
      const recipe = await prisma.recipe.findFirst({
        where: { id: args.recipeId, householdId },
        include: withAuthor,
      });
      if (!recipe) throw new ToolError("No recipe with that id exists in this household.");
      return json(toRecipeDTO(recipe));
    }),
  );

  server.registerTool(
    "list_recipes",
    {
      title: "List recipes in Mise",
      description:
        "List the recipes in the user's Mise library, newest first. Returns a summary of each " +
        "(id, name, cuisine, category) — use get_recipe for the full detail of one. Prefer " +
        "search_recipes when the user is looking for something specific.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("How many recipes to return (default 25)."),
        offset: z.number().int().min(0).optional().describe("Skip this many, for paging."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { limit?: number; offset?: number; householdId?: string }) => {
      requireScope(ctx, "read");
      const householdId = await resolveHousehold(ctx, args.householdId);
      const limit = args.limit ?? 25;
      const [total, recipes] = await Promise.all([
        prisma.recipe.count({ where: { householdId } }),
        prisma.recipe.findMany({
          where: { householdId },
          orderBy: { createdAt: "desc" },
          skip: args.offset ?? 0,
          take: limit,
          select: {
            id: true,
            name: true,
            description: true,
            recipeCuisine: true,
            recipeCategory: true,
            totalTime: true,
            recipeYield: true,
          },
        }),
      ]);
      return json({ total, offset: args.offset ?? 0, count: recipes.length, recipes });
    }),
  );

  // --- meal plan -------------------------------------------------------------

  server.registerTool(
    "get_meal_plan",
    {
      title: "Get the meal plan",
      description:
        "Get planned meals for a single day or a date range, with the recipe attached to each. " +
        "Use for questions like 'what's for dinner tonight' or 'what am I cooking this week'.",
      inputSchema: {
        startDate: DATE.describe("First day to include (YYYY-MM-DD)."),
        endDate: DATE.optional().describe(
          "Last day to include (YYYY-MM-DD). Omit for a single day.",
        ),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { startDate: string; endDate?: string; householdId?: string }) => {
      requireScope(ctx, "read");
      const householdId = await resolveHousehold(ctx, args.householdId);
      const endDate = args.endDate ?? args.startDate;
      if (endDate < args.startDate) throw new ToolError("endDate must not be before startDate.");

      // Dates are stored as YYYY-MM-DD strings, so a lexical range is a date range.
      const meals = await prisma.plannedMeal.findMany({
        where: { householdId, date: { gte: args.startDate, lte: endDate } },
        orderBy: [{ date: "asc" }, { mealType: "asc" }],
        include: {
          recipe: { select: { id: true, name: true, recipeYield: true, householdId: true } },
        },
      });

      return json({
        startDate: args.startDate,
        endDate,
        // The write paths now check recipeId against the household before saving, but
        // this re-checks the join anyway: it's defense in depth against rows written
        // before that fix, which could still point at a foreign recipe. householdId is
        // stripped before it leaves this function — it's an internal id, not tool output.
        meals: meals.map((meal) => {
          const recipe =
            meal.recipe?.householdId === householdId
              ? { id: meal.recipe.id, name: meal.recipe.name, recipeYield: meal.recipe.recipeYield }
              : null;
          return { ...toMealDTO(meal), recipe };
        }),
      });
    }),
  );

  server.registerTool(
    "add_meal_to_plan",
    {
      title: "Add a meal to the plan",
      description:
        "Schedule a recipe on the meal plan for a given date and meal type. Find the recipe id " +
        "with search_recipes first (or create_recipe if it isn't in Mise yet).",
      inputSchema: {
        date: DATE,
        mealType: z.enum(MEAL_TYPES).describe("Which meal of the day."),
        recipeId: z.string().describe("Recipe id from search_recipes or list_recipes."),
        servings: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Servings to plan for (default 1)."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(
      async (args: {
        date: string;
        mealType: (typeof MEAL_TYPES)[number];
        recipeId: string;
        servings?: number;
        householdId?: string;
      }) => {
        requireScope(ctx, "write");
        const householdId = await resolveHousehold(ctx, args.householdId);
        const recipe = await prisma.recipe.findFirst({
          where: { id: args.recipeId, householdId },
          select: { id: true, name: true },
        });
        if (!recipe) throw new ToolError("No recipe with that id exists in this household.");

        const meal = await prisma.plannedMeal.create({
          data: {
            householdId,
            date: args.date,
            mealType: args.mealType,
            recipeId: recipe.id,
            servings: args.servings ?? 1,
          },
        });
        return ok(
          `Planned "${recipe.name}" for ${args.mealType.toLowerCase()} on ${args.date} (meal id ${meal.id}).`,
        );
      },
    ),
  );

  server.registerTool(
    "update_planned_meal",
    {
      title: "Change a planned meal",
      description:
        "Move a planned meal to another date or meal type, swap its recipe, or change its " +
        "servings. Get the meal id from get_meal_plan.",
      inputSchema: {
        mealId: z.string().describe("Planned meal id from get_meal_plan."),
        date: DATE.optional().describe("New date."),
        mealType: z.enum(MEAL_TYPES).optional().describe("New meal type."),
        recipeId: z.string().optional().describe("Swap in a different recipe."),
        servings: z.number().int().positive().optional().describe("New serving count."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(
      async (args: {
        mealId: string;
        date?: string;
        mealType?: (typeof MEAL_TYPES)[number];
        recipeId?: string;
        servings?: number;
        householdId?: string;
      }) => {
        requireScope(ctx, "write");
        const householdId = await resolveHousehold(ctx, args.householdId);
        const existing = await prisma.plannedMeal.findFirst({
          where: { id: args.mealId, householdId },
          select: { id: true },
        });
        if (!existing)
          throw new ToolError("No planned meal with that id exists in this household.");

        if (args.recipeId) {
          const recipe = await prisma.recipe.findFirst({
            where: { id: args.recipeId, householdId },
            select: { id: true },
          });
          if (!recipe) throw new ToolError("No recipe with that id exists in this household.");
        }

        const meal = await prisma.plannedMeal.update({
          where: { id: args.mealId },
          data: {
            ...(args.date !== undefined ? { date: args.date } : {}),
            ...(args.mealType !== undefined ? { mealType: args.mealType } : {}),
            ...(args.recipeId !== undefined ? { recipeId: args.recipeId } : {}),
            ...(args.servings !== undefined ? { servings: args.servings } : {}),
          },
        });
        return json({ updated: toMealDTO(meal) });
      },
    ),
  );

  server.registerTool(
    "remove_meal_from_plan",
    {
      title: "Remove a meal from the plan",
      description: "Delete a planned meal. Get the meal id from get_meal_plan.",
      inputSchema: {
        mealId: z.string().describe("Planned meal id from get_meal_plan."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { mealId: string; householdId?: string }) => {
      requireScope(ctx, "write");
      const householdId = await resolveHousehold(ctx, args.householdId);
      const { count } = await prisma.plannedMeal.deleteMany({
        where: { id: args.mealId, householdId },
      });
      if (count === 0)
        throw new ToolError("No planned meal with that id exists in this household.");
      return ok("Removed that meal from the plan.");
    }),
  );

  // --- shopping list ---------------------------------------------------------

  server.registerTool(
    "get_shopping_list",
    {
      title: "Get the shopping list",
      description:
        "Get the household's shopping list — each item's name, quantity, category, and whether " +
        "it's already been checked off.",
      inputSchema: {
        includeChecked: z
          .boolean()
          .optional()
          .describe("Include items already checked off (default false)."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { includeChecked?: boolean; householdId?: string }) => {
      requireScope(ctx, "read");
      const householdId = await resolveHousehold(ctx, args.householdId);
      const items = await prisma.shoppingItem.findMany({
        where: { householdId, ...(args.includeChecked ? {} : { checked: false }) },
        orderBy: { createdAt: "desc" },
      });
      return json({ count: items.length, items: items.map(toShoppingDTO) });
    }),
  );

  server.registerTool(
    "add_to_shopping_list",
    {
      title: "Add to the shopping list",
      description:
        "Add items to the household's shopping list. Either pass explicit items, or pass a " +
        "recipeId to add that recipe's ingredients (ingredients already on the list are skipped).",
      inputSchema: {
        items: z
          .array(
            z.object({
              name: z.string().describe('Item name, e.g. "Olive oil".'),
              quantity: z.string().optional().describe('Amount, e.g. "2 bottles".'),
              category: z.string().optional().describe('Aisle or grouping, e.g. "Produce".'),
            }),
          )
          .optional()
          .describe("Items to add. Omit when using recipeId."),
        recipeId: z
          .string()
          .optional()
          .describe("Add every ingredient of this recipe that isn't on the list yet."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(
      async (args: {
        items?: { name: string; quantity?: string; category?: string }[];
        recipeId?: string;
        householdId?: string;
      }) => {
        requireScope(ctx, "write");
        const householdId = await resolveHousehold(ctx, args.householdId);

        const existing = await prisma.shoppingItem.findMany({
          where: { householdId },
          select: { name: true },
        });
        const present = new Set(existing.map((item) => item.name.toLowerCase()));

        const additions: {
          name: string;
          quantity: string;
          category: string;
          fromRecipeId?: string;
        }[] = [];

        if (args.recipeId) {
          const recipe = await prisma.recipe.findFirst({
            where: { id: args.recipeId, householdId },
            select: { id: true, name: true, recipeIngredient: true },
          });
          if (!recipe) throw new ToolError("No recipe with that id exists in this household.");
          for (const ingredient of recipe.recipeIngredient) {
            if (present.has(ingredient.toLowerCase())) continue;
            present.add(ingredient.toLowerCase());
            additions.push({
              name: ingredient,
              quantity: "",
              category: "From recipe",
              fromRecipeId: recipe.id,
            });
          }
        }

        for (const item of args.items ?? []) {
          if (present.has(item.name.toLowerCase())) continue;
          present.add(item.name.toLowerCase());
          additions.push({
            name: item.name,
            quantity: item.quantity ?? "",
            category: item.category ?? "",
          });
        }

        if (additions.length === 0) {
          if (!args.recipeId && (args.items ?? []).length === 0) {
            throw new ToolError("Pass items to add, or a recipeId to add a recipe's ingredients.");
          }
          return ok("Everything requested is already on the shopping list.");
        }

        await prisma.shoppingItem.createMany({
          data: additions.map((item) => ({
            householdId,
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            fromRecipeId: item.fromRecipeId ?? null,
          })),
        });

        return ok(
          `Added ${additions.length} item${additions.length === 1 ? "" : "s"} to the shopping list: ${additions
            .map((item) => item.name)
            .join(", ")}.`,
        );
      },
    ),
  );

  // --- pantry ----------------------------------------------------------------

  server.registerTool(
    "list_pantry",
    {
      title: "List pantry items",
      description:
        "List what the household has in stock — pantry, fridge, and freezer — with quantities " +
        "and expiry dates. Use before suggesting recipes to cook from what's on hand.",
      inputSchema: {
        location: z
          .enum(PANTRY_LOCATIONS)
          .optional()
          .describe("Only items stored here. Omit for everything."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { location?: (typeof PANTRY_LOCATIONS)[number]; householdId?: string }) => {
      requireScope(ctx, "read");
      const householdId = await resolveHousehold(ctx, args.householdId);
      const items = await prisma.pantryItem.findMany({
        where: { householdId, ...(args.location ? { location: args.location } : {}) },
        orderBy: { createdAt: "desc" },
      });
      return json({ count: items.length, items: items.map(toPantryDTO) });
    }),
  );

  server.registerTool(
    "add_pantry_items",
    {
      title: "Add items to the pantry",
      description:
        "Add one or more items to the household's pantry, fridge, or freezer — e.g. after the " +
        "user gets home from the shop. Adding an item that's already there updates its quantity.",
      inputSchema: {
        items: z
          .array(
            z.object({
              name: z.string().describe('Item name, e.g. "Basmati rice".'),
              quantity: z.number().optional().describe("How much (default 1)."),
              unit: z.string().optional().describe('Unit for the quantity, e.g. "kg", "cans".'),
              category: z.string().optional().describe('Grouping, e.g. "Grains".'),
              location: z
                .enum(PANTRY_LOCATIONS)
                .optional()
                .describe("Where it's stored (default Pantry)."),
              expires: DATE.optional().describe("Expiry date, if known."),
            }),
          )
          .min(1)
          .describe("Items to add."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(
      async (args: {
        items: {
          name: string;
          quantity?: number;
          unit?: string;
          category?: string;
          location?: (typeof PANTRY_LOCATIONS)[number];
          expires?: string;
        }[];
        householdId?: string;
      }) => {
        requireScope(ctx, "write");
        const householdId = await resolveHousehold(ctx, args.householdId);

        const added: string[] = [];
        const updated: string[] = [];

        for (const item of args.items) {
          // Restocking is the common case, so an existing item of the same name in
          // the same place accumulates rather than producing a duplicate row.
          const location = item.location ?? "Pantry";
          const existing = await prisma.pantryItem.findFirst({
            where: {
              householdId,
              location,
              name: { equals: item.name, mode: "insensitive" },
            },
          });

          if (existing) {
            await prisma.pantryItem.update({
              where: { id: existing.id },
              data: {
                quantityValue: existing.quantityValue + (item.quantity ?? 1),
                ...(item.unit ? { quantityUnit: item.unit } : {}),
                ...(item.category ? { category: item.category } : {}),
                ...(item.expires ? { expires: item.expires } : {}),
              },
            });
            updated.push(existing.name);
            continue;
          }

          await prisma.pantryItem.create({
            data: {
              householdId,
              name: item.name,
              category: item.category ?? "",
              quantityValue: item.quantity ?? 1,
              quantityUnit: item.unit ?? "",
              location,
              expires: item.expires ?? null,
            },
          });
          added.push(item.name);
        }

        const parts = [
          added.length > 0 ? `Added ${added.join(", ")}` : null,
          updated.length > 0 ? `Restocked ${updated.join(", ")}` : null,
        ].filter(Boolean);
        return ok(`${parts.join(". ")}.`);
      },
    ),
  );

  server.registerTool(
    "remove_pantry_item",
    {
      title: "Remove an item from the pantry",
      description:
        "Remove an item from the pantry — e.g. when the user has used it up. Identify it by " +
        "itemId from list_pantry, or by name.",
      inputSchema: {
        itemId: z.string().optional().describe("Pantry item id from list_pantry."),
        name: z.string().optional().describe("Item name, if you don't have the id."),
        householdId: HOUSEHOLD_ID,
      },
    },
    tool(async (args: { itemId?: string; name?: string; householdId?: string }) => {
      requireScope(ctx, "write");
      const householdId = await resolveHousehold(ctx, args.householdId);
      if (!args.itemId && !args.name) throw new ToolError("Pass either an itemId or a name.");

      if (args.itemId) {
        const { count } = await prisma.pantryItem.deleteMany({
          where: { id: args.itemId, householdId },
        });
        if (count === 0)
          throw new ToolError("No pantry item with that id exists in this household.");
        return ok("Removed that item from the pantry.");
      }

      const matches = await prisma.pantryItem.findMany({
        where: { householdId, name: { equals: args.name!, mode: "insensitive" } },
        select: { id: true, name: true, location: true },
      });
      if (matches.length === 0) {
        throw new ToolError(`Nothing called "${args.name}" is in the pantry.`);
      }
      // Never guess which one the user meant: hand the choice back to the assistant.
      if (matches.length > 1) {
        return json({
          error: "Several pantry items share that name. Call remove_pantry_item again with itemId.",
          matches,
        });
      }

      await prisma.pantryItem.delete({ where: { id: matches[0]!.id } });
      return ok(`Removed ${matches[0]!.name} from the pantry.`);
    }),
  );

  registerChatGptTools(server, ctx);

  return server;
}

// ChatGPT connectors expect a specific `search` + `fetch` pair — search returns
// {id, title, url} results and fetch returns one document's full text by id. These
// are thin aliases over the recipe tools above so the same server works as a
// ChatGPT connector without a second implementation.
function registerChatGptTools(server: McpServer, ctx: McpAuthContext): void {
  server.registerTool(
    "search",
    {
      title: "Search Mise",
      description:
        "Search the user's Mise recipe library and return matching recipes as documents " +
        "(id, title, url). Use fetch to read the full recipe for an id.",
      inputSchema: { query: z.string().describe("What to look for.") },
    },
    tool(async (args: { query: string }) => {
      requireScope(ctx, "read");
      const recipes = isSearchEnabled()
        ? (
            await searchRecipes({ householdId: ctx.householdId, query: args.query, limit: 20 })
          ).hits.map((hit) => ({ id: hit.id, title: hit.name }))
        : (
            await prisma.recipe.findMany({
              where: {
                householdId: ctx.householdId,
                name: { contains: args.query, mode: "insensitive" },
              },
              take: 20,
              select: { id: true, name: true },
            })
          ).map((recipe) => ({ id: recipe.id, title: recipe.name }));

      return json({
        results: recipes.map((recipe) => ({ ...recipe, url: `/recipes/${recipe.id}` })),
      });
    }),
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch a Mise recipe",
      description: "Fetch the full content of one Mise recipe by id, as Schema.org Recipe JSON-LD.",
      inputSchema: { id: z.string().describe("Recipe id returned by search.") },
    },
    tool(async (args: { id: string }) => {
      requireScope(ctx, "read");
      const recipe = await prisma.recipe.findFirst({
        where: { id: args.id, householdId: ctx.householdId },
        include: withAuthor,
      });
      if (!recipe) throw new ToolError("No recipe with that id exists in this household.");
      const dto = toRecipeDTO(recipe);
      return json({
        id: recipe.id,
        title: dto.name,
        text: JSON.stringify(dto),
        url: `/recipes/${recipe.id}`,
        metadata: { cuisine: dto.recipeCuisine, category: dto.recipeCategory },
      });
    }),
  );
}
