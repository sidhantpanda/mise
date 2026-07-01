import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Walk up from `from` until a directory containing `marker` is found. Used to
// anchor paths on the package/repo root instead of counting `../` segments,
// which differ between running the TS sources (`tsx src/…`) and the compiled
// output (`node dist/src/…`, one level deeper).
function findUp(marker: string, from: string): string {
  let dir = from;
  for (;;) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate "${marker}" above ${from}`);
    dir = parent;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));

// The `dist/` tree has no package.json, so this resolves to apps/server in both
// dev and prod.
export const serverRoot = findUp("package.json", here);

// pnpm-workspace.yaml only exists at the monorepo root, where the shared .env lives.
export const repoRoot = findUp("pnpm-workspace.yaml", serverRoot);
