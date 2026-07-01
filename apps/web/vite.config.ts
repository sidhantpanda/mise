import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ command }) => ({
  // Load env (e.g. VITE_API_URL) from the shared repo-root .env.
  envDir: repoRoot,
  // Resolve the `@/*` -> ./src/* alias from tsconfig natively (Vite 8+),
  // replacing the vite-tsconfig-paths plugin.
  resolve: { tsconfigPaths: true },
  plugins: [
    // Generates src/routeTree.gen.ts from the files in src/routes.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  build: {
    // The client build emits a manifest so the SSR server can resolve the
    // hashed entry chunk in production. The SSR build (`vite build --ssr ...`)
    // overrides this input with the server entry.
    manifest: true,
    rollupOptions: {
      input: "src/entry-client.tsx",
    },
  },
  ssr: {
    // For the production SSR *build*, bundle all deps into the output so the
    // runtime image doesn't need the frontend packages (react, radix, lucide,
    // recharts, …) in node_modules. Left as default in dev (`serve`) so Vite's
    // middleware-mode SSR keeps externalizing deps as usual.
    noExternal: command === "build" ? true : [],
  },
}));
