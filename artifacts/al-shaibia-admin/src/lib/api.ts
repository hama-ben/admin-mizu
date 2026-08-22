import { supabase } from "@/lib/supabase";

const BASE = "/api/data";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  // Attach the current admin's Supabase Auth session token to every request,
  // now that the backend requires it (see routes/data.ts auth middleware).
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// For the handful of call sites that still use raw fetch() directly instead
// of the api.* helpers above — attaches the same admin session bearer token.
export async function authedFetch(path: string, options?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(`${BASE}${path}`, { ...options, headers });
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  patch: <T>(path: string, body: unknown) =>
    req<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  post: <T>(path: string, body: unknown = {}) =>
    req<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
};
