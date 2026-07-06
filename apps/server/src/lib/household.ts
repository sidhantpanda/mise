import { prisma } from "../prisma.js";
import { AppError } from "./AppError.js";

// The user's active household: their saved choice if they're still a member,
// otherwise their earliest membership, otherwise null (still needs onboarding).
export async function getActiveHouseholdId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeHouseholdId: true },
  });

  if (user?.activeHouseholdId) {
    const stillMember = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId: user.activeHouseholdId, userId } },
      select: { householdId: true },
    });
    if (stillMember) return user.activeHouseholdId;
  }

  const first = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { householdId: true },
  });
  return first?.householdId ?? null;
}

// All households a user belongs to — for the sidebar switcher.
export async function getUserHouseholds(userId: string) {
  const memberships = await prisma.householdMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: { household: { select: { id: true, name: true, type: true } } },
  });
  return memberships.map((m) => m.household);
}

// Pending invitations addressed to an email (matched case-insensitively, since
// emails are stored lowercased) — shown in onboarding and the switcher.
export async function getPendingInvitations(email: string) {
  const invitations = await prisma.invitation.findMany({
    where: { email: email.toLowerCase(), status: "Pending" },
    orderBy: { sentAt: "asc" },
    include: {
      household: {
        select: { id: true, name: true, type: true, createdBy: { select: { displayName: true } } },
      },
    },
  });
  return invitations.map((inv) => ({
    id: inv.id,
    household: { id: inv.household.id, name: inv.household.name, type: inv.household.type },
    inviterName: inv.household.createdBy.displayName,
    role: inv.role,
    sentAt: inv.sentAt.toISOString().slice(0, 10),
  }));
}

// Mirrors the Household interface in packages/common/src/models.ts.
export async function getHouseholdDTO(householdId: string) {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
      invitations: {
        where: { status: { in: ["Pending", "Rejected"] } },
        orderBy: { sentAt: "asc" },
      },
    },
  });
  if (!household) throw new AppError(404, "Household not found");

  return {
    id: household.id,
    name: household.name,
    type: household.type,
    members: household.members.map((m) => ({
      id: m.user.id,
      name: m.user.displayName,
      email: m.user.email,
      role: m.role,
      avatarColor: m.user.avatarColor ?? "oklch(0.62 0.16 42)",
    })),
    invitations: household.invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      status: inv.status,
      sentAt: inv.sentAt.toISOString().slice(0, 10),
    })),
  };
}

export function userDTO(user: {
  id: string;
  displayName: string;
  email: string;
  avatarColor: string | null;
}) {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    avatarColor: user.avatarColor ?? "oklch(0.62 0.16 42)",
  };
}

// The full session payload returned by signup/login/me: the active household (or
// null during onboarding), every household the user belongs to (switcher), and
// any pending invitations addressed to them.
export async function buildMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Not authenticated");
  const activeId = await getActiveHouseholdId(userId);
  return {
    user: userDTO(user),
    household: activeId ? await getHouseholdDTO(activeId) : null,
    households: await getUserHouseholds(userId),
    invitations: await getPendingInvitations(user.email),
  };
}
