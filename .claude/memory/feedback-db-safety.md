---
name: Firestore safety — never touch existing collections
description: User directive — only CREATE new fg_* collections; never delete, modify, or drop any existing Firestore state
type: feedback
originSessionId: c5b2b0e4-cc0b-4bfb-9858-bdb3dfdef04f
---
**Rule:** In the FleetGuard project, never delete, drop, reshape, write-update, or change security rules on ANY existing Firestore collection, document, index, or rule file. Authority is limited to **CREATING new collections**, always prefixed `fg_` per brief rule §14.11.

**Why:** User explicitly stated on 2026-04-15 — *"do not delete any existing db or any update existing collection you have authority to create new one"*. The target Firebase project is shared and likely hosts other applications or historical data. A destructive or even a schema-incompatible write to an existing collection would break unrelated systems and is not recoverable without backups we don't control.

**How to apply:**
- **Every Firestore path used in new code must start with `fg_`**. No exceptions.
- When scaffolding any service file, gate its collection reference with an assertion: `if (!path.startsWith("fg_")) throw new Error(…)`.
- Never call `deleteDoc`, `deleteCollection`, `batch.delete`, bulk writes via Admin CLI, or `firebase firestore:delete` against anything.
- Never modify `firestore.rules` for a non-`fg_*` path — new rules only add paths, they don't touch pre-existing ones.
- Never drop, rename, or recreate Firestore indexes that already exist; only add new indexes for `fg_*` queries.
- Brief's §14 rules still compound: even within `fg_*`, `fg_audit_events` and `fg_gate_events` are append-only after create.
- Preflight check before any data-touching command: print the target Firebase `projectId` and confirm it's the FleetGuard project, not something else.
- When in doubt, **read-only is safe; any write must target an `fg_*` path you created**.
- If a migration ever needs to re-shape an existing `fg_*` collection, create a new one (`fg_*_v2`) and dual-write — never mutate the original.
