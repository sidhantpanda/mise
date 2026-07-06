import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccessTokens } from "@/hooks";
import type { CreatedAccessToken } from "common";
import { useCreateAccessToken, useRevokeAccessToken } from "@/hooks/mutations";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/access-tokens")({
  head: () => ({
    meta: [
      { title: "Access Tokens - Mise" },
      { name: "description", content: "Create and revoke integration access tokens." },
    ],
  }),
  component: AccessTokensPage,
});

function AccessTokensPage() {
  const tokensQuery = useAccessTokens();
  const tokens = tokensQuery.data ?? [];
  const createToken = useCreateAccessToken();
  const revokeToken = useRevokeAccessToken();
  const [name, setName] = useState("");
  const [writeAccess, setWriteAccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Token name is required");
      return;
    }

    try {
      const token = await createToken.mutateAsync({
        name: name.trim(),
        scopes: writeAccess ? ["read", "write"] : ["read"],
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      });
      setCreated(token);
      setName("");
      setWriteAccess(false);
      setExpiresAt(null);
      toast.success("Access token created");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't create access token");
    }
  };

  const revoke = async (id: string, tokenName: string) => {
    if (!confirm(`Revoke "${tokenName}"? Services using it will stop working.`)) return;
    try {
      await revokeToken.mutateAsync(id);
      if (created?.id === id) setCreated(null);
      toast.success("Access token revoked");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't revoke access token");
    }
  };

  return (
    <AppShell
      title="Access tokens"
      subtitle="Let other services use Mise on your behalf"
      actions={null}
    >
      <div className="max-w-5xl space-y-6">
        {created && <CreatedToken token={created} onDismiss={() => setCreated(null)} />}

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h2 className="text-display text-2xl">Create token</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The full token is shown only once after creation.
              </p>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_auto] lg:items-end"
          >
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Weekly meal bot"
              />
            </Field>
            <Field label="Expires">
              <DateTimePicker value={expiresAt} onChange={setExpiresAt} placeholder="No expiry" />
            </Field>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={writeAccess}
                onChange={(event) => setWriteAccess(event.target.checked)}
                className="size-4 rounded border-border"
              />
              Write access
            </label>
            <button
              type="submit"
              disabled={createToken.isPending}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              Create
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-display text-2xl">Active tokens</h2>
              <p className="text-sm text-muted-foreground">
                {tokens.length} token{tokens.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {tokensQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No access tokens yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-190 text-sm">
                <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Scopes</th>
                    <th className="py-2 pr-4 font-medium">Last used</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium">Expires</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{token.name}</div>
                        <div className="text-xs text-muted-foreground">{token.prefix}...</div>
                      </td>
                      <td className="py-3 pr-4">{token.scopes.join(", ")}</td>
                      <td className="py-3 pr-4">{formatDateTime(token.lastUsedAt)}</td>
                      <td className="py-3 pr-4">{formatDateTime(token.createdAt)}</td>
                      <td className="py-3 pr-4">{formatDateTime(token.expiresAt)}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => revoke(token.id, token.name)}
                          disabled={revokeToken.isPending}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60"
                          aria-label={`Revoke ${token.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function CreatedToken({ token, onDismiss }: { token: CreatedAccessToken; onDismiss: () => void }) {
  const copy = async () => {
    await navigator.clipboard.writeText(token.token);
    toast.success("Token copied");
  };

  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-display text-xl">Token created</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy it now. It will not be shown again.
          </p>
          <code className="mt-4 block overflow-x-auto rounded-xl border border-border bg-background p-3 text-xs">
            {token.token}
          </code>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Copy className="size-4" />
            Copy
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm transition hover:bg-accent hover:text-accent-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
