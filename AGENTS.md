<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Firestore Collection Safety — MANDATORY

The Firebase project is **shared**. Collections not prefixed `fg_` belong to other applications and must never be written to, deleted, or have their security rules modified.

**Rule:** All collections **not** starting with `fg_` are **read-only** for this project. No writes, no deletes, no schema changes, no index drops — not even via Admin SDK.

**Allowed operations on non-`fg_*` collections:** `get`, `list`, `query` — reads only, and only when explicitly required by a feature spec.

**For `fg_*` collections:**
- You may CREATE new `fg_*` collections freely.
- `fg_audit_events` and `fg_gate_events` are **append-only** — never update or delete documents in these collections.
- To reshape an existing `fg_*` collection, create a versioned replacement (`fg_*_v2`) and dual-write — never mutate the original schema in place.
- All collection paths must be imported from `app/_lib/fg-paths.ts`. Never hardcode collection name strings outside that file.
- Every service must guard paths with `assertFgPath()` before any write.

**Before any data-touching command:** confirm the target Firebase `projectId` is the FleetGuard project, not another environment.
<!-- END:nextjs-agent-rules -->
