# Plan: Make Mise an installable, offline-capable PWA

## Goal

1. **Installable** on mobile (Android/iOS) and desktop — "Add to Home Screen", standalone window, app icon/splash.
2. **Offline read-only**: when the network is unavailable, the user can still browse
   **recipes** (list + detail), **meal plans**, **shopping list**, and **pantry** from the
   last-synced data. Writes (create/edit/delete/check-off) are disabled with a clear
   "offline" affordance rather than failing with errors.
3. Graceful degradation: online behaviour is unchanged; offline is a fallback layer.

Out of scope (call out explicitly): offline *mutations* / write queue / background sync,
conflict resolution, and offline auth for a *first* login. These are follow-ups.

---

## Architecture context


- **Full-document SSR + hydration.** `entry-client.tsx` calls `hydrateRoot(document, …)`;
  `__root.tsx` `RootShell` renders the whole `<html>`. There is **no static `index.html`** —
  every route is server-rendered per request and the client entry `<script>` is injected by
  `apps/web/server.ts`. → We cannot precache a static shell the usual vite-plugin-pwa way; the
  SW must treat navigations specially.
- **Data layer = TanStack Query v5.** Per-resource hooks (`hooks/recipes.ts`, `meals.ts`,
  `shopping.ts`, `pantry.ts`, `household.ts`, `auth.ts`) with tidy keys in `hooks/keys.ts`
  (`recipes`, `recipe(id)`, `meals`, `shopping`, `pantry`, `household`, `me`). → Offline data is
  best delivered by **persisting the Query cache** + SW runtime-caching the `/api` GETs.
- **Same-origin API.** `lib/api.ts` hits `/api/...` with `credentials: "include"`. → SW runtime
  caching can key on `/api/...` URLs directly.
- **Cookie auth, and `AppShell` hard-redirects to `/login`** when `me.isError || !me.data`
  (`components/AppShell.tsx`). → Offline this would bounce the user to login. **Must be made
  offline-aware.**
- **Prod serving** is a custom Express server (`server.ts`): `sirv` for `dist/client` (root) and
  `/assets` (immutable), SSR for everything else, sitting behind the API front-door proxy. → The
  SW, manifest, and icons just need to land in `dist/client` and they'll be served at root.

---

## Hard prerequisite: HTTPS

Service workers and install prompts **only work in a secure context** (HTTPS, or
`http://localhost`).

---

## Tooling decision

Use **`vite-plugin-pwa` in `injectManifest` mode** (i.e. we author the SW; the plugin injects the
precache manifest as `self.__WB_MANIFEST` and wires the build). Reasons:

- `generateSW` assumes an `index.html` to transform and precache — we don't have one.
- `injectManifest` + Workbox (`workbox-routing`, `workbox-strategies`, `workbox-expiration`)
  gives us explicit control over navigation and `/api` caching, which we need for the SSR + auth
  situation.

Fallback if the plugin fights the custom SSR build: a small **post-build `workbox-build` script**
reading `dist/client/.vite/manifest.json` to generate `dist/client/sw.js`. Keep this in mind —
plugin integration with a non-`index.html`, custom-input build is the riskiest single item here.

---

## Phased work breakdown

### Phase 0 — TLS (prereq)
- [ ] Verify the app loads over HTTPS end-to-end.

### Phase 1 — Web app manifest + icons (installability)
- [ ] Create `apps/web/public/` (Vite copies it to `dist/client/`, already served by `sirv`).
- [ ] Generate icons from a source logo: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
      `apple-touch-icon.png` (180×180). Tool: `pwa-asset-generator`. (The current logo is the
      lucide `Soup` glyph on `--primary` — reproduce it as a real raster.)
- [ ] Add `public/manifest.webmanifest`: `name`/`short_name` "Mise", `start_url: "/"`,
      `scope: "/"`, `display: "standalone"`, `theme_color`, `background_color`, `icons` (incl.
      `purpose: "maskable"`).
- [ ] In `__root.tsx` `head()` add to `links`/`meta`:
  - `{ rel: "manifest", href: "/manifest.webmanifest" }`
  - `{ name: "theme-color", content: "…" }`
  - `{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" }`
  - iOS bits: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
    `apple-mobile-web-app-title`.
- [ ] Verify Lighthouse "Installable" passes (manifest + SW + HTTPS all required).

### Phase 2 — Service worker (app shell + asset precache + API runtime cache)
- [ ] Add `vite-plugin-pwa` with `strategies: "injectManifest"`, `srcDir: "src"`,
      `filename: "sw.ts"`, `injectRegister: false` (we register manually), `manifest: false`
      (we ship our own), `injectManifest.globDirectory: "dist/client"` with
      `globPatterns: ["assets/**/*.{js,css,woff2}", "*.{png,svg,ico,webmanifest}"]`.
- [ ] Author `apps/web/src/sw.ts`:
  - `precacheAndRoute(self.__WB_MANIFEST)` for hashed assets.
  - **Navigations** (`request.mode === "navigate"`): `NetworkFirst` → on failure serve the last
    cached document, else a precached `offline.html` shell. Any cached document boots the client
    router, which then routes client-side and reads persisted data. (Accept a possible hydration
    reconciliation on the offline shell — see Risks.)
  - **`/api` GETs** for `recipes`, `recipes/:id`, `meals`, `shopping`, `pantry`, `me`,
    `household`: `NetworkFirst` (fresh when online, cached when offline), cache name `api-cache`,
    only cache `200`s (never `401`/`5xx`), short `networkTimeoutSeconds`.
  - **Images** (recipe images): `CacheFirst` with `ExpirationPlugin` (cap count + max age).
    External Unsplash URLs cached opaquely; uploaded images (same-origin) cached normally.
  - `skipWaiting`/`clientsClaim` gated behind an explicit update flow (Phase 5).
- [ ] Register the SW in `entry-client.tsx` after `hydrateRoot`, guarded by
      `"serviceWorker" in navigator` and production-only.
- [ ] Ensure `sw.js`, `manifest.webmanifest`, `offline.html`, and icons are emitted into
      `dist/client` and thus served at root by `server.ts` (add an explicit `offline.html` shell
      generation step if needed).

### Phase 3 — Persist the Query cache (offline data survives reloads)
- [ ] Add `@tanstack/react-query-persist-client` + an **IndexedDB** persister (via `idb-keyval`).
      (localStorage is too small for recipe payloads.)
- [ ] In `__root.tsx` swap `QueryClientProvider` → `PersistQueryClientProvider`, **client-only**
      (persister guarded by `typeof window !== "undefined"`; on the server it must no-op so SSR is
      unaffected). Note the `QueryClient` is created per request in `router.tsx` `getRouter()`.
- [ ] Configure `gcTime`/persister `maxAge` (~7 days) and `dehydrateOptions` to persist only
      successful queries. Bump query `staleTime` so cached data renders instantly then revalidates.
- [ ] Rely on TanStack Query `networkMode: "online"` default: when offline, queries stay paused
      (don't throw) and render persisted data.

### Phase 4 — Offline-aware auth + read-only UX
- [ ] Add `hooks/use-online-status.ts` (`navigator.onLine` + `online`/`offline` events; SSR-safe
      default `true`).
- [ ] **Fix the auth gate** in `AppShell.tsx`: today `me.isError || !me.data` → `<Navigate
      to="/login" />`. Change to: if **offline and** a persisted `me`/cached data exists → render
      the app in read-only mode; only redirect to `/login` when **online** and unauthenticated.
- [ ] Add a global **offline banner** ("Offline — showing saved data. Editing is disabled.").
- [ ] Add `useIsReadOnly()` (= offline) and gate write UI: hide/disable "New recipe", add/edit/
      delete dialogs, shopping check toggles, meal-plan edits, pantry edits. Prefer disabling the
      entry points over letting `useMutation` fire and fail.
- [ ] Belt-and-braces: make mutation hooks throw a friendly "You're offline" error if invoked
      while offline.

### Phase 5 — SW lifecycle / update flow
- [ ] Detect a waiting SW; show a "New version available — reload" toast (reuse `sonner`).
- [ ] On confirm: `postMessage({type:"SKIP_WAITING"})` → `skipWaiting()` → reload.
- [ ] Ensure `/api` responses and `sw.js` itself aren't over-cached by nginx/Express (correct
      `Cache-Control`; `sw.js` must not be immutable-cached).

### Phase 6 — Testing & verification
- [ ] Lighthouse PWA audit (installable + offline) in CI-ish local run.
- [ ] Manual: load online → DevTools "Offline" → reload → recipes/meals/shopping/pantry still
      render; writes disabled; no `/login` bounce.
- [ ] Real device install over HTTPS (Android Chrome + iOS Safari); verify standalone launch and
      offline browsing.
- [ ] Verify a logged-out first visit offline still lands on `/login` sensibly (no white screen).

---

## Caching strategy summary

| Content | Request | Strategy | Cache | Notes |
|---|---|---|---|---|
| App shell / JS / CSS / fonts | precache (`__WB_MANIFEST`) | Precache | workbox precache | hashed, immutable |
| Navigations (HTML) | `mode: navigate` | NetworkFirst → cached doc → `offline.html` | `pages` | boots client router offline |
| Data GETs (`recipes`, `recipe/:id`, `meals`, `shopping`, `pantry`, `me`, `household`) | `GET /api/*` | NetworkFirst (timeout ~3s) | `api-cache` | only cache `200`; skip `401`/`5xx` |
| Recipe images | `GET` image | CacheFirst + expiration | `images` | cap count/age; Unsplash opaque |
| Mutations | `POST/PATCH/DELETE /api/*` | Network only (no cache) | — | disabled in UI when offline |

---

## Files to add / modify

**Add**
- `apps/web/public/manifest.webmanifest`, `apps/web/public/icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- `apps/web/src/sw.ts` (Workbox service worker)
- `apps/web/public/offline.html` (or a build step that emits it)
- `apps/web/src/hooks/use-online-status.ts`
- `apps/web/src/lib/read-only.ts` (`useIsReadOnly`, offline-guard helper)
- `apps/web/src/lib/query-persister.ts` (IndexedDB persister, client-guarded)

**Modify**
- `apps/web/vite.config.ts` — add `VitePWA({...})`
- `apps/web/src/routes/__root.tsx` — manifest/theme/apple-icon head tags;
  `PersistQueryClientProvider`; offline banner
- `apps/web/src/entry-client.tsx` — SW registration + update flow
- `apps/web/src/components/AppShell.tsx` — offline-aware auth gate + read-only gating
- Write UI (recipe form, dialogs, shopping/pantry/meal toggles) — disable when read-only
- `apps/web/package.json` — deps: `vite-plugin-pwa`, `workbox-*`,
  `@tanstack/react-query-persist-client`, `idb-keyval`

---

## Risks & edge cases

- **vite-plugin-pwa × SSR/custom-input build** is the biggest unknown (no `index.html`, custom
  entry, `noExternal` SSR bundle). Budget time to fall back to a `workbox-build` post-build script.
- **Hydration vs offline shell.** `hydrateRoot(document, …)` expects SSR markup. Serving a generic
  `offline.html` for a navigation may cause a hydration reconcile; validate that the client router
  cleanly takes over (may need a client-only boot path when served the offline shell).
- **Auth cache & shared devices.** SW-cached `/api` responses and the persisted Query cache are
  per-browser and unscoped to a user — on a shared device, user B could see user A's cached data
  until revalidation. On logout: `clear()` the persister and delete the `api-cache`. Document this.
- **Stale data expectations.** Read-only offline shows last-synced data; make "as of <time>"
  visible where sensible (esp. shopping list) so users don't act on stale state.
- **iOS quirks.** No install prompt (manual "Add to Home Screen"), stricter storage eviction,
  and SW/cache limits — test explicitly on Safari.
- **`sw.js` caching.** If nginx/Express serve `sw.js` with long cache headers, updates stall. Force
  short/no-cache for `sw.js` and the manifest.
