---
name: Al-Shaibia auth architecture
description: Auth migration details — Replit Auth replaced Supabase auth; Supabase kept for data queries; two-server setup.
---

# Al-Shaibia Auth Architecture

Supabase Auth was replaced with Replit Auth (OIDC) during migration.

**Why:** Migration guardrails require replacing client-side auth (Supabase signInWithPassword) with Replit's server-side OIDC auth for security.

**How to apply:**
- Auth module lives at `artifacts/api-server/src/replit_integrations/auth/`
- `setupAuth(app)` and `registerAuthRoutes(app)` are called in `artifacts/api-server/src/app.ts` BEFORE other routes
- Login: redirect to `/api/login` | Logout: redirect to `/api/logout` | User: GET `/api/auth/user`
- Supabase client (`@supabase/supabase-js`) is still used for all data queries (users, orders, drivers, payments, announcements, disputes) — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY remain in `.replit` userenv
- `admin_users` table (Replit DB) stores Replit-side user info; Supabase DB stores app data
- `sessions` table (Replit DB) stores express-session data via connect-pg-simple
- Auth schema is in `lib/db/src/schema/auth.ts`
- Vite dev server proxies `/api/*` → `localhost:3001` (API_PORT=3001)
- Vite MUST run on port 5000 (webview requirement); API server runs on port 3001
- AuthContext no longer uses `session` — uses `user`, `loading`, `isAuthenticated`
