---
name: Supabase Realtime channel names
description: Avoiding callback-registration crashes when multiple React components mount the same Supabase Realtime topic.
---

Each React listener instance must use a unique Supabase Realtime channel name, or share one deliberately through a single owner. The Supabase client reuses channels by topic; a second `.on("postgres_changes", ...)` call on an already subscribed topic throws synchronously.

**Why:** The admin shell mounted the same notification hook in both the sidebar and topbar, and the reused topic caused the entire React tree to unmount.

**How to apply:** Use an instance-scoped channel identifier for independent hook subscriptions, and keep an Error Boundary around the app so an unexpected subscription or render error shows recovery UI instead of a blank screen.