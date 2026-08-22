# Al-Shaibia Admin Panel

An admin dashboard for managing users, drivers, orders, payments, announcements, and disputes for a logistics/delivery platform in Algeria.

## Run & Operate

- `PORT=5000 BASE_PATH=/ API_PORT=3001 pnpm --filter @workspace/al-shaibia-admin run dev` — run the frontend (port 5000, webview)
- `PORT=3001 pnpm --filter @workspace/api-server run dev` — run the API server (port 3001)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `SESSION_SECRET` — session signing key (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind CSS 4, Radix UI, Recharts, Wouter
- API: Express 5 (port 3001), proxied from Vite `/api/*`
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Auth: Replit Auth (OIDC) — login via `/api/login`, logout via `/api/logout`
- Data: Supabase client for direct DB queries (using VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/al-shaibia-admin/` — React frontend SPA
- `artifacts/api-server/` — Express API server (auth routes, health check)
- `artifacts/api-server/src/replit_integrations/auth/` — Replit Auth integration (replitAuth.ts, storage.ts, routes.ts)
- `lib/db/` — Drizzle schema + DB client
- `lib/db/src/schema/auth.ts` — sessions and admin_users tables (required for Replit Auth)
- `lib/api-spec/` — OpenAPI spec (source of truth)
- `lib/api-client-react/` — generated React Query hooks

## Architecture decisions

- Auth is handled server-side via Replit OIDC (express-session + passport + connect-pg-simple)
- Vite dev server proxies `/api/*` → `localhost:3001` (API server)
- Supabase client is kept for direct data queries (frontend reads/writes to Supabase DB directly)
- Admin user sessions are stored in PostgreSQL `sessions` table (Replit DB)
- `admin_users` table stores Replit user info (separate from Supabase's `users` table)

## Product

Admin dashboard for Al-Shaibia logistics platform. Manages:
- **Users** — customer and driver accounts
- **Driver Queue** — pending driver approval/rejection with verification docs
- **Orders** — order tracking with customer/driver details
- **Payments** — driver payment approvals
- **Announcements** — push announcements to drivers/customers
- **Disputes** — rating dispute resolution

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/db run push` after schema changes
- The Vite dev server MUST run on port 5000 (webview requirement)
- The API server runs on port 3001 (console workflow)
- Supabase keys are in `[userenv.shared]` in `.replit` — they're the data layer keys (not auth)
- Auth is Replit Auth — never use Supabase auth again

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
