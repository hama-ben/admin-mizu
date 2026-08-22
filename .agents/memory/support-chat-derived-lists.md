---
name: Derived-list conversations vs. deep links
description: A UI list built by grouping existing rows (e.g. messages -> conversations) will silently exclude any entity that has no rows yet, breaking "start new X" deep links.
---

When a UI list (e.g. `support-chat.tsx` conversations) is derived purely by
grouping/aggregating existing child rows (support_messages), any entity with
zero rows (a user who never messaged support) has no entry in that derived
list at all. A deep link that sets the "selected id" (e.g. `?userId=` from a
context-menu action) will update state correctly, but the `find()` against
the derived list returns null/undefined, silently falling through to the
generic empty-state UI — this looks exactly like "the button does nothing,"
even though navigation and param-reading both worked correctly.

**Why:** This caused a real bug report where "Message via Support" appeared
broken twice — the first attempted fix only checked wiring (onClick, params)
which were both already correct; the actual break was the list-derivation
step silently excluding never-contacted users.

**How to apply:** When adding a "jump to / start a new X" entry point into a
page whose main list is derived from child rows, always add a synthesized
placeholder entry (empty message list, real user metadata fetched
separately) for the case where the target has no rows yet — and keep that
placeholder out of the visible list/sidebar so it doesn't get persisted
until the first real row is created.
