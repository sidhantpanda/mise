import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Home, UtensilsCrossed } from "lucide-react";
import { useMe } from "@/hooks";
import { useAcceptInvitation, useRejectInvitation } from "@/hooks/mutations";
import { HouseholdSetupForm } from "@/components/household-setup-form";
import { Button } from "@/components/ui/button";
import type { PendingInvitation } from "common";
import { AuthShell } from "./login";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your kitchen — Mise" },
      { name: "description", content: "Create your household or restaurant." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [creatingOwn, setCreatingOwn] = useState(false);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }
  if (me.isError || !me.data) return <Navigate to="/login" />;
  // Already onboarded (incl. just-accepted an invite) — nothing to do here.
  if (me.data.household) return <Navigate to="/" />;

  const firstName = me.data.user.name.split(" ")[0];
  const invitations = me.data.invitations;
  const showInvites = invitations.length > 0 && !creatingOwn;

  if (showInvites) {
    return (
      <AuthShell title="You're invited" subtitle={`Welcome, ${firstName}! Join a kitchen below.`}>
        <div className="space-y-3">
          {invitations.map((inv) => (
            <InvitationCard
              key={inv.id}
              invitation={inv}
              onAccepted={() => navigate({ to: "/" })}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCreatingOwn(true)}
          className="mt-6 h-auto w-full py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          Or create your own instead
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set up your kitchen"
      subtitle={`Welcome, ${firstName}! What are you cooking for?`}
    >
      <HouseholdSetupForm firstName={firstName} onCreated={() => navigate({ to: "/" })} />
      {invitations.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCreatingOwn(false)}
          className="mt-6 h-auto w-full py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          Back to invitations
        </Button>
      )}
    </AuthShell>
  );
}

function InvitationCard({
  invitation,
  onAccepted,
}: {
  invitation: PendingInvitation;
  onAccepted: () => void;
}) {
  const accept = useAcceptInvitation();
  const reject = useRejectInvitation();
  const busy = accept.isPending || reject.isPending;
  const Icon = invitation.household.type === "Restaurant" ? UtensilsCrossed : Home;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{invitation.household.name}</div>
          <div className="text-xs text-muted-foreground">
            {invitation.household.type} · invited by {invitation.inviterName}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            await accept.mutateAsync(invitation.id);
            onAccepted();
          }}
          className="h-9 flex-1 rounded-full shadow-none hover:bg-primary hover:opacity-90 disabled:opacity-60"
        >
          {accept.isPending ? "Joining…" : "Accept"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => reject.mutate(invitation.id)}
          className="h-9 rounded-full border border-border bg-card px-4 font-normal hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
