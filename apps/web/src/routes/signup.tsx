import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useSignup } from "@/hooks/mutations";
import { ApiError } from "@/lib/api";
import { AuthShell, Field } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — Mise" },
      { name: "description", content: "Create your Mise kitchen account." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      await signup.mutateAsync({ name, email, password });
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  };

  return (
    <AuthShell title="Create your kitchen" subtitle="Recipes, meal plans, pantry — in one place.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ava Marlow"
            autoComplete="name"
            autoFocus
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={signup.isPending}
          className="h-11 w-full rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
        >
          {signup.isPending ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
