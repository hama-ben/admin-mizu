---
name: Supabase Node WebSocket transport
description: The Realtime transport required by Supabase clients running in Node.js 20.
---

Every Supabase client instantiated in a Node.js 20 process must receive the `ws` constructor through `realtime.transport`; browser clients should prefer the native WebSocket and fall back to `ws` only outside the browser.

**Why:** Node.js 20 does not provide the native WebSocket implementation required by Supabase Realtime, which otherwise surfaces a runtime error while loading data routes that instantiate the client.

**How to apply:** Add `ws` and `@types/ws` to the owning workspace package, then apply the transport option to every `createClient` call in both server-side and shared initialization modules.