# Poom project setup

React, Vite, TypeScript, Tailwind CSS v4, TanStack Query v5, and Supabase Edge Functions starter.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- Docker Desktop (or another Docker-compatible runtime) for Supabase local services

## Install

```sh
npm install
cp .env.example .env.local
```

For local Supabase, set `VITE_SUPABASE_URL=http://127.0.0.1:54321` and set `VITE_SUPABASE_PUBLISHABLE_KEY` to the local publishable/anon key printed by `npm run supabase:start` (`API URL` and `anon key` on older CLI output). The publishable key is intended for browser use. Never put a Supabase secret or `service_role` key in a `VITE_` variable.

For a hosted project, use its project URL and publishable key. No remote project is linked or deployed by this setup.

## Frontend development

```sh
npm run dev
```

The initial screen shows whether the environment variables exist and invokes `health-check` through `supabase.functions.invoke()` when they do. Restart Vite after changing `.env.local`.

```sh
npm run build
npm run lint
```

## Supabase local development

Start Docker first, then run:

```sh
npm run supabase:start
```

Copy the local API URL and publishable (or legacy anon) key shown by the CLI into `.env.local`. In another terminal, run the function locally:

```sh
npm run functions:serve
```

The function keeps Supabase's default JWT verification enabled (`verify_jwt = true`). Calls through `supabase-js` include the local API key; when a user session exists the SDK also sends its access token. For a direct local smoke test, use the local key as the `apikey` and bearer credential printed by the CLI:

```sh
curl -i --request POST 'http://127.0.0.1:54321/functions/v1/health-check' \
  --header 'Authorization: Bearer YOUR_LOCAL_ANON_OR_PUBLISHABLE_KEY' \
  --header 'apikey: YOUR_LOCAL_ANON_OR_PUBLISHABLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

Expected JSON includes `"status":"ok"`. Stop local services when finished:

```sh
npm run supabase:stop
```

Useful scripts:

- `npm run supabase:start` — start the local Supabase stack
- `npm run supabase:stop` — stop it
- `npm run functions:serve` — serve only `health-check` locally, retaining JWT verification

The CLI project dependency is installed locally, so npm scripts use this project's CLI version.

## Structure

```text
src/
  app/                  Global providers
  features/health-check/ Function query and status UI
  lib/                  Supabase and TanStack Query clients
  types/                Shared response types
  App.tsx
  main.tsx
  index.css
supabase/
  functions/health-check/
  config.toml
```
