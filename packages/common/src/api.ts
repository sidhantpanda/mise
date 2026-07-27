/**
 * API request/response payload types shared by the server routes and the web
 * app's React Query hooks.
 */
import type { Household, HouseholdSummary, PendingInvitation, Recipe } from "./models.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  /**
   * A demo/viewer account. The server rejects every mutating request from it;
   * the UI mirrors that by disabling write controls rather than letting them
   * fail. Never trust this alone — it is a hint for rendering, not the guard.
   */
  isReadOnly: boolean;
};

/** Session payload returned by /auth/signup, /auth/login and /auth/me. */
export type Me = {
  user: AuthUser;
  household: Household | null;
  households: HouseholdSummary[];
  invitations: PendingInvitation[];
};

/** Access token as returned by /auth/tokens (the secret is only in CreatedAccessToken). */
export type AccessToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  household: { id: string; name: string };
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CreatedAccessToken = AccessToken & { token: string };

/** Request body for creating/patching a recipe (a partial Schema.org Recipe). */
export type RecipeInput = Partial<Omit<Recipe, "@context" | "@type" | "identifier">>;

/** Response of POST /recipes/upload. */
export type RecipeUploadResult = {
  created: Recipe[];
  errors: { source: string; name?: string; error: string }[];
};

/**
 * One entry in the public recipe library index (list.json). `id` is the
 * library-relative file path, which doubles as the stable identifier the client
 * sends back to import the recipe.
 */
export type PublicRecipeSummary = {
  id: string;
  name: string;
  time: string;
  cuisine: string;
  mealType: string;
  description: string;
  imageUrl: string;
};

/** Response of POST /public-library/import. */
export type PublicLibraryImportResult = {
  recipe: Recipe;
};
