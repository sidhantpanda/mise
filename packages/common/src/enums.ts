// Shared enumerations used by API payloads on both the server and the web app.
// Each is a readonly tuple (usable in zod's z.enum and UI option lists) plus the
// derived union type.

export const HOUSEHOLD_TYPES = ["Household", "Restaurant"] as const;
export type HouseholdType = (typeof HOUSEHOLD_TYPES)[number];

export const MEMBER_ROLES = ["Owner", "Admin", "Member", "Viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Roles an existing member may hand out on an invite — Owner is not transferable. */
export const INVITABLE_ROLES = ["Member", "Admin", "Viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const INVITATION_STATUSES = ["Pending", "Accepted", "Rejected"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const PANTRY_LOCATIONS = ["Pantry", "Fridge", "Freezer"] as const;
export type PantryLocation = (typeof PANTRY_LOCATIONS)[number];

export const ACCESS_TOKEN_SCOPES = ["read", "write"] as const;
export type AccessTokenScope = (typeof ACCESS_TOKEN_SCOPES)[number];
