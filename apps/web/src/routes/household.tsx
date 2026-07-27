import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { WriteGuard } from "@/components/write-guard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useHousehold } from "@/hooks";
import { useInvite, useRevokeInvite, useUpdateHousehold } from "@/hooks/mutations";
import { toast } from "sonner";
import { Download, Loader2, Mail, Settings, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/household")({
  head: () => ({
    meta: [
      { title: "Household - Mise" },
      {
        name: "description",
        content: "Manage your household or restaurant team - invite members, assign roles.",
      },
      { property: "og:title", content: "Household - Mise" },
      {
        property: "og:description",
        content: "Manage your household or restaurant team - invite members, assign roles.",
      },
    ],
  }),
  component: HouseholdPage,
});

function HouseholdPage() {
  const householdQuery = useHousehold();
  const hh = householdQuery.data;
  const invite = useInvite();
  const revoke = useRevokeInvite();
  const updateHousehold = useUpdateHousehold();
  const [email, setEmail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState("");
  const [downloading, setDownloading] = useState(false);

  const downloadLibrary = async () => {
    setDownloading(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await api.download("/recipes/export", `mise-recipes-${date}.zip`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't download the recipe library.");
    } finally {
      setDownloading(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    try {
      await invite.mutateAsync(email);
      setEmail("");
      toast.success("Invitation sent");
    } catch {
      toast.error("Couldn't send the invitation.");
    }
  };

  const openSettings = () => {
    setName(hh?.name ?? "");
    setSettingsOpen(true);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await updateHousehold.mutateAsync({ name: name.trim() });
      toast.success("Saved");
      setSettingsOpen(false);
    } catch {
      toast.error("Couldn't save changes.");
    }
  };

  if (!hh) {
    return (
      <AppShell title="Household">
        <div className="py-20 text-center text-muted-foreground">Loading household…</div>
      </AppShell>
    );
  }

  const invitations = hh.invitations;

  return (
    <AppShell
      title={hh.name}
      subtitle={`${hh.type} · ${hh.members.length} members`}
      actions={
        <WriteGuard>
          <Button
            onClick={openSettings}
            className="h-9 shrink-0 gap-1.5 rounded-full whitespace-nowrap shadow-none hover:bg-primary hover:opacity-90"
          >
            <Settings className="size-4" />
            Settings
          </Button>
        </WriteGuard>
      }
    >
      <div className="grid lg:grid-cols-3 gap-6">
        {/* members */}
        <section className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-6">
          <h2 className="text-display text-2xl mb-5">Members</h2>
          <ul className="divide-y divide-border">
            {hh.members.map((m) => (
              <li
                key={m.id}
                className="py-4 first:pt-0 last:pb-0 flex flex-wrap items-center gap-3 sm:gap-4"
              >
                <div
                  className="size-11 sm:size-12 shrink-0 rounded-full grid place-items-center text-white font-semibold"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground break-all">{m.email}</div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-xs font-medium">
                  <Shield className="size-3" />
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* invite */}
        <section className="bg-card border border-border rounded-2xl p-4 sm:p-6">
          <h2 className="text-display text-2xl mb-2">Invite</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add cooks, family, or co-workers to {hh.name}.
          </p>
          <form onSubmit={send} className="flex flex-col gap-2 min-[420px]:flex-row">
            <div className="relative flex-1">
              <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <WriteGuard>
              <Button
                type="submit"
                className="h-10 rounded-lg px-4 shadow-none hover:bg-primary hover:opacity-90"
              >
                Send
              </Button>
            </WriteGuard>
          </form>

          {invitations.length > 0 && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Invitations
              </div>
              <ul className="space-y-2">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-3 text-sm bg-secondary/50 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium break-all">{inv.email}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {inv.status === "Rejected" ? "Declined" : `Sent ${inv.sentAt}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {inv.status === "Rejected" && (
                        <WriteGuard side="left">
                          <Button
                            variant="link"
                            onClick={() => invite.mutate(inv.email)}
                            className="h-auto p-0 text-xs font-medium"
                          >
                            Invite again
                          </Button>
                        </WriteGuard>
                      )}
                      <WriteGuard side="left">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => revoke.mutate(inv.id)}
                          className="size-auto p-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
                          aria-label="Remove invitation"
                        >
                          <X className="size-4" />
                        </Button>
                      </WriteGuard>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 bg-card border border-border rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-display text-2xl">Download all recipe library</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Export every recipe in {hh.name} as a ZIP of Schema.org JSON-LD files. Keep a backup or
            move your library elsewhere - the ZIP imports straight back into Mise.
          </p>
        </div>
        <Button
          onClick={downloadLibrary}
          disabled={downloading}
          className="h-10 shrink-0 rounded-full px-5 shadow-none hover:bg-primary hover:opacity-90 disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {downloading ? "Preparing…" : "Download"}
        </Button>
      </section>

      <section className="mt-6 bg-primary text-primary-foreground rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-display text-2xl">Running a restaurant?</h3>
          <p className="text-sm text-primary-foreground/80 mt-1 max-w-xl">
            Mise supports multi-entity workspaces with role-based access - chefs, prep, FOH. Switch
            this household to a restaurant in settings.
          </p>
        </div>
        <WriteGuard side="top">
          <Button className="h-10 shrink-0 rounded-full bg-accent px-5 text-accent-foreground shadow-none hover:bg-accent hover:opacity-90">
            Convert
          </Button>
        </WriteGuard>
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-display text-2xl sm:text-3xl font-normal">
              {hh.type === "Restaurant" ? "Restaurant settings" : "Household settings"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveSettings} className="space-y-4">
            <Field label={hh.type === "Restaurant" ? "Restaurant name" : "Household name"}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSettingsOpen(false)}
                className="h-10 rounded-full border border-border bg-card px-5 font-normal hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateHousehold.isPending}
                className="h-10 rounded-full px-6 shadow-none hover:bg-primary hover:opacity-90 disabled:opacity-60"
              >
                {updateHousehold.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
