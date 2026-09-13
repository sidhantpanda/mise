# Mise documentation

The public Mise website and documentation portal, built with Next.js and Fumadocs.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter docs dev
```

The default development URL is `http://localhost:3000`. Pass `--port 3001` when
the Mise product app is already using port 3000.

## Validation

```bash
pnpm --filter docs lint
pnpm --filter docs typecheck
pnpm --filter docs build
```

## Deploy to Vercel

Import the Mise repository as a new Vercel project and set **Root Directory** to
`apps/docs`. Vercel detects Next.js and supplies the build and output settings.

Optionally set `NEXT_PUBLIC_SITE_URL` to the preferred production origin, for example
`https://docs.mise.example.com`. It is used for canonical sitemap and social metadata
URLs; Vercel's system URL is used when it is absent. No database or other runtime
service is required by the docs app.
