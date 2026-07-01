import type { Request } from "express";

type HttpMethod = "get" | "post" | "patch" | "delete";
type Schema = Record<string, unknown>;
type SecurityMode = "public" | "session" | "auth" | "write";

type RouteSpec = {
  method: HttpMethod;
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  security?: SecurityMode;
  requestBody?: Schema;
  responses?: Record<number, { description: string; schema?: Schema }>;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (schema: Schema) => ({ type: "array", items: schema });
const nullable = (schema: Schema) => ({ ...schema, nullable: true });
const ok = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };

const schemas = {
  Error: {
    type: "object",
    properties: { error: { type: "string" } },
    required: ["error"],
  },
  Health: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  },
  User: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      avatarColor: { type: "string" },
    },
    required: ["id", "name", "email", "avatarColor"],
  },
  HouseholdSummary: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      type: { type: "string", enum: ["Household", "Restaurant"] },
    },
    required: ["id", "name", "type"],
  },
  HouseholdMember: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      role: { type: "string", enum: ["Owner", "Admin", "Member"] },
      avatarColor: { type: "string" },
    },
    required: ["id", "name", "email", "role", "avatarColor"],
  },
  HouseholdInvitation: {
    type: "object",
    properties: {
      id: { type: "string" },
      email: { type: "string", format: "email" },
      status: { type: "string", enum: ["Pending", "Accepted", "Rejected"] },
      sentAt: { type: "string" },
    },
    required: ["id", "email", "status", "sentAt"],
  },
  PendingInvitation: {
    type: "object",
    properties: {
      id: { type: "string" },
      household: ref("HouseholdSummary"),
      inviterName: { type: "string" },
      role: { type: "string", enum: ["Owner", "Admin", "Member"] },
      sentAt: { type: "string" },
    },
    required: ["id", "household", "inviterName", "role", "sentAt"],
  },
  Household: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      type: { type: "string", enum: ["Household", "Restaurant"] },
      members: arrayOf(ref("HouseholdMember")),
      invitations: arrayOf(ref("HouseholdInvitation")),
    },
    required: ["id", "name", "type", "members", "invitations"],
  },
  Session: {
    type: "object",
    properties: {
      user: ref("User"),
      household: nullable(ref("Household")),
      households: arrayOf(ref("HouseholdSummary")),
      invitations: arrayOf(ref("PendingInvitation")),
    },
    required: ["user", "household", "households", "invitations"],
  },
  SignupInput: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8, maxLength: 200 },
    },
    required: ["name", "email", "password"],
  },
  LoginInput: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 1 },
    },
    required: ["email", "password"],
  },
  AccessToken: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      prefix: { type: "string" },
      scopes: { type: "array", items: { type: "string", enum: ["read", "write"] } },
      household: ref("HouseholdSummary"),
      lastUsedAt: nullable({ type: "string", format: "date-time" }),
      expiresAt: nullable({ type: "string", format: "date-time" }),
      createdAt: { type: "string", format: "date-time" },
      revokedAt: nullable({ type: "string", format: "date-time" }),
    },
    required: ["id", "name", "prefix", "scopes", "household", "lastUsedAt", "expiresAt", "createdAt", "revokedAt"],
  },
  CreatedAccessToken: {
    allOf: [
      ref("AccessToken"),
      {
        type: "object",
        properties: { token: { type: "string" } },
        required: ["token"],
      },
    ],
  },
  CreateAccessTokenInput: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      scopes: { type: "array", items: { type: "string", enum: ["read", "write"] }, minItems: 1 },
      expiresAt: nullable({ type: "string", format: "date-time" }),
    },
    required: ["name"],
  },
  RecipeInstructionStep: {
    type: "object",
    properties: {
      "@type": { type: "string", enum: ["HowToStep"] },
      name: { type: "string" },
      text: { type: "string" },
    },
    required: ["text"],
  },
  RecipeInstructionSection: {
    type: "object",
    properties: {
      "@type": { type: "string", enum: ["HowToSection"] },
      name: { type: "string" },
      itemListElement: { type: "array", items: ref("RecipeInstructionStep") },
    },
    required: ["itemListElement"],
  },
  RecipeInstruction: {
    anyOf: [ref("RecipeInstructionStep"), ref("RecipeInstructionSection")],
  },
  RecipeInstructionInput: {
    anyOf: [
      { type: "string" },
      ref("RecipeInstructionStep"),
      ref("RecipeInstructionSection"),
    ],
  },
  Nutrition: {
    type: "object",
    properties: {
      "@type": { type: "string", enum: ["NutritionInformation"] },
      calories: { type: "string" },
      proteinContent: { type: "string" },
      carbohydrateContent: { type: "string" },
      fatContent: { type: "string" },
    },
  },
  AggregateRating: {
    type: "object",
    properties: {
      "@type": { type: "string", enum: ["AggregateRating"] },
      ratingValue: { type: "number" },
      ratingCount: { type: "integer" },
    },
    required: ["ratingValue", "ratingCount"],
  },
  Recipe: {
    type: "object",
    additionalProperties: true,
    properties: {
      "@context": { type: "string" },
      "@type": { type: "string", enum: ["Recipe"] },
      identifier: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      image: { type: "array", items: { type: "string" } },
      author: {
        type: "object",
        properties: {
          "@type": { type: "string", enum: ["Person"] },
          identifier: { type: "string" },
          name: { type: "string" },
        },
        required: ["@type", "name"],
      },
      datePublished: { type: "string" },
      prepTime: { type: "string" },
      cookTime: { type: "string" },
      performTime: { type: "string" },
      totalTime: { type: "string" },
      cookingMethod: { type: "string" },
      recipeYield: { type: "string" },
      yield: {},
      recipeCategory: { type: "string" },
      recipeCuisine: { type: "string" },
      keywords: { type: "array", items: { type: "string" } },
      suitableForDiet: { type: "array", items: { type: "string" } },
      recipeIngredient: { type: "array", items: { type: "string" } },
      recipeInstructions: arrayOf(ref("RecipeInstruction")),
      estimatedCost: {},
      supply: {},
      tool: {},
      nutrition: ref("Nutrition"),
      aggregateRating: ref("AggregateRating"),
    },
    required: ["@context", "@type", "identifier", "name", "description", "image", "author", "datePublished", "recipeIngredient", "recipeInstructions"],
  },
  RecipeInput: {
    type: "object",
    additionalProperties: true,
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      image: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      author: { type: "object", properties: { name: { type: "string" } } },
      prepTime: { type: "string" },
      cookTime: { type: "string" },
      performTime: { type: "string" },
      totalTime: { type: "string" },
      cookingMethod: { type: "string" },
      recipeYield: { type: "string" },
      yield: {},
      recipeCategory: { type: "string" },
      recipeCuisine: { type: "string" },
      keywords: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      suitableForDiet: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      recipeIngredient: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      recipeInstructions: { anyOf: [ref("RecipeInstructionInput"), arrayOf(ref("RecipeInstructionInput"))] },
      estimatedCost: {},
      supply: {},
      tool: {},
      nutrition: nullable(ref("Nutrition")),
      aggregateRating: nullable(ref("AggregateRating")),
      schemaJson: {},
    },
  },
  Meal: {
    type: "object",
    properties: {
      identifier: { type: "string" },
      date: { type: "string" },
      mealType: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] },
      recipeId: { type: "string" },
      servings: { type: "integer" },
      assignee: { type: "string" },
    },
    required: ["identifier", "date", "mealType", "recipeId", "servings"],
  },
  MealInput: {
    type: "object",
    properties: {
      date: { type: "string", minLength: 1 },
      mealType: { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Snack"] },
      recipeId: { type: "string", minLength: 1 },
      servings: { type: "integer", minimum: 1 },
      assignee: nullable({ type: "string" }),
    },
  },
  ShoppingItem: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      quantity: { type: "string" },
      category: { type: "string" },
      checked: { type: "boolean" },
      fromRecipeId: { type: "string" },
    },
    required: ["id", "name", "quantity", "category", "checked"],
  },
  ShoppingItemInput: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      quantity: { type: "string" },
      category: { type: "string" },
      checked: { type: "boolean" },
      fromRecipeId: nullable({ type: "string" }),
    },
  },
  ShoppingCheckedInput: {
    type: "object",
    properties: {
      ids: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
      checked: { type: "boolean" },
    },
    required: ["ids", "checked"],
  },
  ShoppingFromRecipeResult: {
    type: "object",
    properties: {
      added: { type: "integer" },
      items: arrayOf(ref("ShoppingItem")),
    },
    required: ["added", "items"],
  },
  PantryQuantity: {
    type: "object",
    properties: {
      "@type": { type: "string", enum: ["QuantitativeValue"] },
      value: { type: "number" },
      unitText: { type: "string" },
    },
    required: ["value", "unitText"],
  },
  PantryItem: {
    type: "object",
    properties: {
      "@type": { type: "string", enum: ["Product"] },
      identifier: { type: "string" },
      name: { type: "string" },
      category: { type: "string" },
      quantity: ref("PantryQuantity"),
      expires: { type: "string" },
      location: { type: "string", enum: ["Pantry", "Fridge", "Freezer"] },
    },
    required: ["@type", "identifier", "name", "category", "quantity", "location"],
  },
  PantryItemInput: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      category: { type: "string" },
      quantity: {
        type: "object",
        properties: { value: { type: "number" }, unitText: { type: "string" } },
        required: ["value", "unitText"],
      },
      expires: nullable({ type: "string" }),
      location: { type: "string", enum: ["Pantry", "Fridge", "Freezer"] },
    },
  },
  HouseholdInput: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      type: { type: "string", enum: ["Household", "Restaurant"] },
    },
    required: ["name", "type"],
  },
  HouseholdUpdateInput: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      type: { type: "string", enum: ["Household", "Restaurant"] },
    },
  },
  ActiveHouseholdInput: {
    type: "object",
    properties: { householdId: { type: "string", minLength: 1 } },
    required: ["householdId"],
  },
  InviteInput: {
    type: "object",
    properties: { email: { type: "string", format: "email" } },
    required: ["email"],
  },
};

const routes: RouteSpec[] = [
  {
    method: "get",
    path: "/api/health",
    tags: ["System"],
    summary: "Health check",
    responses: { 200: { description: "Server is healthy.", schema: ref("Health") } },
  },
  {
    method: "get",
    path: "/api/openapi.json",
    tags: ["System"],
    summary: "Get the generated OpenAPI document",
    responses: { 200: { description: "OpenAPI document." } },
  },
  {
    method: "get",
    path: "/api/docs",
    tags: ["System"],
    summary: "Open Swagger UI",
    responses: { 200: { description: "Swagger UI HTML." } },
  },
  {
    method: "post",
    path: "/api/auth/signup",
    tags: ["Auth"],
    summary: "Create an account",
    requestBody: ref("SignupInput"),
    responses: { 201: { description: "Created session.", schema: ref("Session") } },
  },
  {
    method: "post",
    path: "/api/auth/login",
    tags: ["Auth"],
    summary: "Log in",
    requestBody: ref("LoginInput"),
    responses: { 200: { description: "Authenticated session.", schema: ref("Session") } },
  },
  {
    method: "post",
    path: "/api/auth/logout",
    tags: ["Auth"],
    summary: "Log out",
    responses: { 200: { description: "Session cleared.", schema: ok } },
  },
  {
    method: "get",
    path: "/api/auth/me",
    tags: ["Auth"],
    summary: "Get the current user session",
    security: "auth",
    responses: { 200: { description: "Current session.", schema: ref("Session") } },
  },
  {
    method: "get",
    path: "/api/auth/tokens",
    tags: ["Access Tokens"],
    summary: "List active access tokens",
    security: "session",
    responses: { 200: { description: "Active tokens.", schema: arrayOf(ref("AccessToken")) } },
  },
  {
    method: "post",
    path: "/api/auth/tokens",
    tags: ["Access Tokens"],
    summary: "Create an access token",
    description: "The full token value is returned once in this response and is not stored in plaintext.",
    security: "session",
    requestBody: ref("CreateAccessTokenInput"),
    responses: { 201: { description: "Created access token.", schema: ref("CreatedAccessToken") } },
  },
  {
    method: "delete",
    path: "/api/auth/tokens/{id}",
    tags: ["Access Tokens"],
    summary: "Revoke an access token",
    security: "session",
    responses: { 200: { description: "Token revoked.", schema: ok } },
  },
  {
    method: "post",
    path: "/api/households",
    tags: ["Households"],
    summary: "Create a household",
    security: "session",
    requestBody: ref("HouseholdInput"),
    responses: { 201: { description: "Created household.", schema: ref("Household") } },
  },
  {
    method: "post",
    path: "/api/households/active",
    tags: ["Households"],
    summary: "Switch active household",
    security: "session",
    requestBody: ref("ActiveHouseholdInput"),
    responses: { 200: { description: "Active household switched.", schema: ok } },
  },
  {
    method: "get",
    path: "/api/household",
    tags: ["Household"],
    summary: "Get active household",
    security: "session",
    responses: { 200: { description: "Active household.", schema: ref("Household") } },
  },
  {
    method: "patch",
    path: "/api/household",
    tags: ["Household"],
    summary: "Update active household",
    security: "session",
    requestBody: ref("HouseholdUpdateInput"),
    responses: { 200: { description: "Updated household.", schema: ref("Household") } },
  },
  {
    method: "post",
    path: "/api/household/invitations",
    tags: ["Household"],
    summary: "Invite a user to the active household",
    security: "session",
    requestBody: ref("InviteInput"),
    responses: { 201: { description: "Updated household.", schema: ref("Household") } },
  },
  {
    method: "delete",
    path: "/api/household/invitations/{id}",
    tags: ["Household"],
    summary: "Delete an active household invitation",
    security: "session",
    responses: { 200: { description: "Updated household.", schema: ref("Household") } },
  },
  {
    method: "post",
    path: "/api/invitations/{id}/accept",
    tags: ["Invitations"],
    summary: "Accept an invitation",
    security: "session",
    responses: { 200: { description: "Invitation accepted.", schema: ok } },
  },
  {
    method: "post",
    path: "/api/invitations/{id}/reject",
    tags: ["Invitations"],
    summary: "Reject an invitation",
    security: "session",
    responses: { 200: { description: "Invitation rejected.", schema: ok } },
  },
  {
    method: "get",
    path: "/api/recipes",
    tags: ["Recipes"],
    summary: "List recipes",
    security: "auth",
    responses: { 200: { description: "Recipes.", schema: arrayOf(ref("Recipe")) } },
  },
  {
    method: "get",
    path: "/api/recipes/{id}",
    tags: ["Recipes"],
    summary: "Get a recipe",
    security: "auth",
    responses: { 200: { description: "Recipe.", schema: ref("Recipe") } },
  },
  {
    method: "post",
    path: "/api/recipes",
    tags: ["Recipes"],
    summary: "Create a recipe",
    security: "write",
    requestBody: ref("RecipeInput"),
    responses: { 201: { description: "Created recipe.", schema: ref("Recipe") } },
  },
  {
    method: "patch",
    path: "/api/recipes/{id}",
    tags: ["Recipes"],
    summary: "Update a recipe",
    security: "write",
    requestBody: ref("RecipeInput"),
    responses: { 200: { description: "Updated recipe.", schema: ref("Recipe") } },
  },
  {
    method: "delete",
    path: "/api/recipes/{id}",
    tags: ["Recipes"],
    summary: "Delete a recipe",
    security: "write",
    responses: { 200: { description: "Recipe deleted.", schema: ok } },
  },
  {
    method: "get",
    path: "/api/meals",
    tags: ["Meals"],
    summary: "List planned meals",
    security: "auth",
    responses: { 200: { description: "Planned meals.", schema: arrayOf(ref("Meal")) } },
  },
  {
    method: "post",
    path: "/api/meals",
    tags: ["Meals"],
    summary: "Create a planned meal",
    security: "write",
    requestBody: { ...ref("MealInput"), required: ["date", "mealType", "recipeId"] },
    responses: { 201: { description: "Created planned meal.", schema: ref("Meal") } },
  },
  {
    method: "patch",
    path: "/api/meals/{id}",
    tags: ["Meals"],
    summary: "Update a planned meal",
    security: "write",
    requestBody: ref("MealInput"),
    responses: { 200: { description: "Updated planned meal.", schema: ref("Meal") } },
  },
  {
    method: "delete",
    path: "/api/meals/{id}",
    tags: ["Meals"],
    summary: "Delete a planned meal",
    security: "write",
    responses: { 200: { description: "Planned meal deleted.", schema: ok } },
  },
  {
    method: "get",
    path: "/api/shopping",
    tags: ["Shopping"],
    summary: "List shopping items",
    security: "auth",
    responses: { 200: { description: "Shopping items.", schema: arrayOf(ref("ShoppingItem")) } },
  },
  {
    method: "post",
    path: "/api/shopping",
    tags: ["Shopping"],
    summary: "Create a shopping item",
    security: "write",
    requestBody: { ...ref("ShoppingItemInput"), required: ["name"] },
    responses: { 201: { description: "Created shopping item.", schema: ref("ShoppingItem") } },
  },
  {
    method: "post",
    path: "/api/shopping/clear-checked",
    tags: ["Shopping"],
    summary: "Clear checked shopping items",
    security: "write",
    responses: { 200: { description: "Remaining shopping items.", schema: arrayOf(ref("ShoppingItem")) } },
  },
  {
    method: "post",
    path: "/api/shopping/from-recipe/{recipeId}",
    tags: ["Shopping"],
    summary: "Add a recipe's ingredients to the shopping list",
    security: "write",
    responses: { 200: { description: "Shopping additions.", schema: ref("ShoppingFromRecipeResult") } },
  },
  {
    method: "patch",
    path: "/api/shopping",
    tags: ["Shopping"],
    summary: "Check or uncheck multiple shopping items",
    security: "write",
    requestBody: ref("ShoppingCheckedInput"),
    responses: { 200: { description: "Updated shopping items.", schema: arrayOf(ref("ShoppingItem")) } },
  },
  {
    method: "patch",
    path: "/api/shopping/{id}",
    tags: ["Shopping"],
    summary: "Update a shopping item",
    security: "write",
    requestBody: ref("ShoppingItemInput"),
    responses: { 200: { description: "Updated shopping item.", schema: ref("ShoppingItem") } },
  },
  {
    method: "delete",
    path: "/api/shopping/{id}",
    tags: ["Shopping"],
    summary: "Delete a shopping item",
    security: "write",
    responses: { 200: { description: "Shopping item deleted.", schema: ok } },
  },
  {
    method: "get",
    path: "/api/pantry",
    tags: ["Pantry"],
    summary: "List pantry items",
    security: "auth",
    responses: { 200: { description: "Pantry items.", schema: arrayOf(ref("PantryItem")) } },
  },
  {
    method: "post",
    path: "/api/pantry",
    tags: ["Pantry"],
    summary: "Create a pantry item",
    security: "write",
    requestBody: { ...ref("PantryItemInput"), required: ["name"] },
    responses: { 201: { description: "Created pantry item.", schema: ref("PantryItem") } },
  },
  {
    method: "patch",
    path: "/api/pantry/{id}",
    tags: ["Pantry"],
    summary: "Update a pantry item",
    security: "write",
    requestBody: ref("PantryItemInput"),
    responses: { 200: { description: "Updated pantry item.", schema: ref("PantryItem") } },
  },
  {
    method: "delete",
    path: "/api/pantry/{id}",
    tags: ["Pantry"],
    summary: "Delete a pantry item",
    security: "write",
    responses: { 200: { description: "Pantry item deleted.", schema: ok } },
  },
];

function securityFor(mode?: SecurityMode) {
  if (!mode || mode === "public") return undefined;
  if (mode === "session") return [{ cookieAuth: [] }];
  return [{ cookieAuth: [] }, { bearerAuth: [] }];
}

function requestBody(schema?: Schema) {
  if (!schema) return undefined;
  return {
    required: true,
    content: {
      "application/json": { schema },
    },
  };
}

function responsesFor(route: RouteSpec) {
  const responses = route.responses ?? { 200: { description: "OK" } };
  return Object.fromEntries(
    Object.entries(responses).map(([status, response]) => [
      status,
      {
        description: response.description,
        ...(response.schema
          ? { content: { "application/json": { schema: response.schema } } }
          : {}),
      },
    ]),
  );
}

function pathParameters(path: string) {
  const matches = [...path.matchAll(/\{([^}]+)\}/g)];
  return matches.map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function buildPaths() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = (paths[route.path] ??= {});
    path[route.method] = {
      tags: route.tags,
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      ...(securityFor(route.security) ? { security: securityFor(route.security) } : {}),
      ...(pathParameters(route.path).length ? { parameters: pathParameters(route.path) } : {}),
      ...(route.requestBody ? { requestBody: requestBody(route.requestBody) } : {}),
      responses: {
        ...responsesFor(route),
        400: { description: "Bad request.", content: { "application/json": { schema: ref("Error") } } },
        401: { description: "Not authenticated.", content: { "application/json": { schema: ref("Error") } } },
        403: { description: "Forbidden.", content: { "application/json": { schema: ref("Error") } } },
        404: { description: "Not found.", content: { "application/json": { schema: ref("Error") } } },
      },
    };
  }
  return paths;
}

export function createOpenApiDocument(req: Request) {
  const origin = `${req.protocol}://${req.get("host")}`;
  return {
    openapi: "3.1.0",
    info: {
      title: "Mise API",
      version: "1.0.0",
      description:
        "Household cooking API. Browser sessions use the session cookie; external services use Bearer access tokens. Mutating endpoints require a write-scoped access token when called with Bearer auth.",
    },
    servers: [{ url: origin }],
    tags: [
      { name: "System" },
      { name: "Auth" },
      { name: "Access Tokens" },
      { name: "Households" },
      { name: "Household" },
      { name: "Invitations" },
      { name: "Recipes" },
      { name: "Meals" },
      { name: "Shopping" },
      { name: "Pantry" },
    ],
    paths: buildPaths(),
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "mise_session",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      schemas,
    },
  };
}

export function swaggerHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mise API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fff; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          persistAuthorization: true,
          displayRequestDuration: true,
        });
      };
    </script>
  </body>
</html>`;
}
