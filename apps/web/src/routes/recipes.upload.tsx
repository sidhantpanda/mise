import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileJson, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { WriteGuard } from "@/components/write-guard";
import { useUploadRecipes } from "@/hooks/mutations";
import type { RecipeUploadResult } from "common";

export const Route = createFileRoute("/recipes/upload")({
  head: () => ({
    meta: [
      { title: "Upload Recipes - Mise" },
      { name: "description", content: "Import Schema.org Recipe JSON-LD files." },
      { property: "og:title", content: "Upload Recipes - Mise" },
      { property: "og:description", content: "Import Schema.org Recipe JSON-LD files." },
    ],
  }),
  component: UploadRecipesPage,
});

function UploadRecipesPage() {
  const uploadRecipes = useUploadRecipes();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<RecipeUploadResult | null>(null);

  const onFiles = (files: FileList | null) => {
    const selected = files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
  };

  const submit = async () => {
    if (!file) {
      toast.error("Choose a JSON-LD file or ZIP first");
      return;
    }

    try {
      const nextResult = await uploadRecipes.mutateAsync(file);
      setResult(nextResult);
      toast.success(
        nextResult.created.length === 1
          ? "Imported 1 recipe"
          : `Imported ${nextResult.created.length} recipes`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recipe upload failed");
    }
  };

  return (
    <AppShell
      title="Upload recipes"
      subtitle="Import a JSON-LD file or a ZIP of JSON-LD files"
      actions={
        <Link
          to="/recipes"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
        >
          <ArrowLeft className="size-4" /> Library
        </Link>
      }
    >
      <section className="max-w-3xl space-y-5">
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles(event.dataTransfer.files);
          }}
          className={`grid min-h-72 place-items-center rounded-2xl border border-dashed bg-card p-6 text-center transition ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <div className="max-w-md">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-secondary text-foreground">
              <UploadCloud className="size-7" />
            </div>
            <h2 className="mt-5 text-display text-2xl">Drop your recipe file here</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              JSON-LD files are imported directly. ZIP files are unpacked and parsed by the server.
            </p>

            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-input bg-background px-5 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground">
                <FileJson className="size-4" />
                Select file
                <input
                  type="file"
                  accept=".json,.jsonld,.zip,application/json,application/ld+json,application/zip"
                  className="sr-only"
                  onChange={(event) => onFiles(event.target.files)}
                />
              </label>
              <WriteGuard>
                <Button
                  type="button"
                  onClick={submit}
                  disabled={!file || uploadRecipes.isPending}
                  className="h-10 gap-2 rounded-full px-6 shadow-none hover:bg-primary hover:opacity-90 disabled:opacity-60"
                >
                  <UploadCloud className="size-4" />
                  {uploadRecipes.isPending ? "Uploading..." : "Upload"}
                </Button>
              </WriteGuard>
            </div>

            {file && (
              <p className="mt-4 text-sm text-foreground">
                Selected <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>
        </div>

        {result && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-display text-xl">Import results</h2>
            <div className="mt-4 space-y-3">
              {result.created.map((recipe) => (
                <Link
                  key={recipe.identifier}
                  to="/recipes/$id"
                  params={{ id: recipe.identifier }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{recipe.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Open</span>
                </Link>
              ))}

              {result.errors.map((error, index) => (
                <div
                  key={`${error.source}-${index}`}
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="font-medium">{error.name ?? error.source}</p>
                    <p className="text-muted-foreground">{error.error}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
