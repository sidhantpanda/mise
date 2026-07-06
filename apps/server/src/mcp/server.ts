import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppError } from "../lib/AppError.js";
import { createRecipe } from "../lib/recipes.js";
import { isSearchEnabled, searchRecipes } from "../lib/recipeSearch.js";

// The authenticated caller a per-request MCP server acts on behalf of. Derived
// from the Bearer access token (or, later, an OAuth grant) on the /mcp request.
export type McpAuthContext = {
  userId: string;
  householdId: string;
  scopes: string[];
};

// Turn the flat tool arguments into a Schema.org Recipe JSON-LD body that
// createRecipe (and recipeInputSchema behind it) understands. A caller-supplied
// schemaJson is used as the base; the structured fields are merged on top.
function buildRecipeBody(args: Record<string, unknown>): Record<string, unknown> {
  const { schemaJson, author, ...fields } = args;
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

// Build a fresh MCP server bound to one authenticated caller. In stateless
// Streamable HTTP mode we construct one of these per request, so tool handlers
// can close over the caller's household + scopes without any shared state.
export function buildMcpServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer(
    { name: "mise", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "create_recipe",
    {
      title: "Send a recipe to Mise",
      description:
        "Save a recipe to the user's Mise household. Provide the recipe as structured " +
        "fields (name, ingredients, steps) and/or a full Schema.org Recipe JSON-LD object " +
        "via schemaJson. Use this whenever the user asks to send, save, or add a recipe to Mise.",
      inputSchema: {
        name: z.string().describe("Recipe title. Required unless it is present inside schemaJson."),
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
        prepTime: z
          .string()
          .optional()
          .describe("Prep time as an ISO 8601 duration, e.g. PT20M."),
        cookTime: z
          .string()
          .optional()
          .describe("Cook time as an ISO 8601 duration, e.g. PT45M."),
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
      },
    },
    async (args) => {
      if (!ctx.scopes.includes("write")) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: 'This connection is read-only. Reconnect with a Mise token that has the "write" scope to save recipes.',
            },
          ],
        };
      }

      try {
        const recipe = await createRecipe({
          body: buildRecipeBody(args),
          householdId: ctx.householdId,
          createdById: ctx.userId,
        });
        return {
          content: [
            {
              type: "text",
              text: `Saved "${recipe.name}" to Mise (recipe id ${recipe.identifier}).`,
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof AppError ? err.message : "The recipe could not be saved to Mise.";
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    },
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Search recipes in Mise",
      description:
        "Search the user's Mise recipe library by name, ingredient, cuisine, category, or " +
        "keyword. Returns matching recipes in relevance order. Use this to find a recipe the " +
        "user already has (e.g. before answering questions about it or planning a meal).",
      inputSchema: {
        query: z
          .string()
          .describe("Free-text search, e.g. an ingredient, dish name, or cuisine."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of results to return (default 10)."),
      },
    },
    async (args) => {
      if (!ctx.scopes.includes("read")) {
        return {
          isError: true,
          content: [{ type: "text", text: "This connection is not permitted to read recipes." }],
        };
      }
      if (!isSearchEnabled()) {
        return {
          isError: true,
          content: [{ type: "text", text: "Recipe search is not available on this Mise server." }],
        };
      }

      try {
        const hits = await searchRecipes({
          householdId: ctx.householdId,
          query: args.query,
          limit: args.limit ?? 10,
        });
        if (hits.length === 0) {
          return { content: [{ type: "text", text: `No recipes matched "${args.query}".` }] };
        }
        const lines = hits.map((hit) => {
          const facets = [hit.recipeCuisine, hit.recipeCategory].filter(Boolean).join(", ");
          return `- ${hit.name}${facets ? ` (${facets})` : ""} — id ${hit.id}`;
        });
        return {
          content: [
            {
              type: "text",
              text: `Found ${hits.length} recipe${hits.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
            },
          ],
        };
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: "Recipe search is temporarily unavailable." }],
        };
      }
    },
  );

  return server;
}

