import { useState } from "react";
import { Check, ChevronsUpDown, Home, Plus, UtensilsCrossed } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { HouseholdSetupForm } from "@/components/household-setup-form";
import { useMe } from "@/hooks";
import { useSwitchHousehold, useAcceptInvitation, useRejectInvitation } from "@/hooks/mutations";
import type { Household } from "@/lib/mock-data";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("");
}

export function HouseholdSwitcher({ active }: { active: Household }) {
  const me = useMe();
  const households = me.data?.households ?? [];
  const invitations = me.data?.invitations ?? [];
  const switchHousehold = useSwitchHousehold();
  const accept = useAcceptInvitation();
  const reject = useRejectInvitation();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="p-3 m-3 rounded-xl bg-sidebar-accent/60 border border-sidebar-border">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg text-left transition hover:opacity-90"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {active.type}
              </div>
              <div className="text-display text-lg leading-tight truncate">{active.name}</div>
            </div>
            {invitations.length > 0 && (
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {invitations.length}
              </span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Your kitchens
          </DropdownMenuLabel>
          {households.map((h) => {
            const Icon = h.type === "Restaurant" ? UtensilsCrossed : Home;
            const isActive = h.id === active.id;
            return (
              <DropdownMenuItem
                key={h.id}
                disabled={isActive || switchHousehold.isPending}
                onSelect={() => {
                  if (!isActive) switchHousehold.mutate(h.id);
                }}
                className="gap-2"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{h.name}</span>
                {isActive && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}

          {invitations.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Invitations
              </DropdownMenuLabel>
              {invitations.map((inv) => (
                <div key={inv.id} className="px-2 py-1.5">
                  <div className="text-sm font-medium truncate">{inv.household.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    by {inv.inviterName}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      disabled={accept.isPending || reject.isPending}
                      onClick={() => accept.mutate(inv.id)}
                      className="h-7 flex-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={accept.isPending || reject.isPending}
                      onClick={() => reject.mutate(inv.id)}
                      className="h-7 px-2.5 rounded-md border border-border text-xs hover:bg-accent disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" />
            Create household
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex -space-x-2 mt-3">
        {active.members.map((m) => (
          <div
            key={m.id}
            title={m.name}
            className="size-7 rounded-full ring-2 ring-sidebar grid place-items-center text-[11px] font-semibold text-white"
            style={{ backgroundColor: m.avatarColor }}
          >
            {initials(m.name)}
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-display text-2xl font-normal">
              Create a kitchen
            </DialogTitle>
            <DialogDescription>
              Add another household or restaurant to your account.
            </DialogDescription>
          </DialogHeader>
          <HouseholdSetupForm onCreated={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
