# FleetGuard — Mock → Production Implementation Plan

**Version:** 0.1  ·  **Date:** 2026-04-15  ·  **Status:** Approved scope
**Audience:** Engineering team wiring the backend to replace the current mock data layer

---

## 0. Safety contract (non-negotiable)

These rules override everything else in this document. If any step appears to conflict with a safety rule, stop and escalate.

| # | Rule | Enforcement |
|---|---|---|
| S1 | **Never delete** any existing Firestore collection, document, or index | ESLint rule + preflight check + firestore.rules deny |
| S2 | **Never modify** the shape or contents of any existing collection | Code review gate; writes only to `fg_*` |
| S3 | **Only create new collections prefixed `fg_`** (brief §14 rule 11) | Runtime assertion in every service function |
| S4 | **Never change** an existing Firestore index or security rule — only **add** new ones scoped to `fg_*` | `firestore.rules` and `firestore.indexes.json` diffs reviewed manually before deploy |
| S5 | **`fg_audit_events` is append-only** after create (brief §14 rule 3) | `update` + `delete` denied in rules |
| S6 | **`fg_gate_events` is immutable** after create (brief §14 rule 4) | `update` + `delete` denied in rules |
| S7 | **PINs, QR tokens, face-compare raw scores never leave the server** | Server-only routes under `/api/*`; never logged to console in prod |
| S8 | **Firebase Admin SDK only inside `/api/*/route.ts`** — never imported by a component, hook, page, or service | Import boundary ESLint rule |
| S9 | **Preflight before every run** — print target Firebase `projectId` and abort if it isn't the FleetGuard project | `scripts/preflight.ts` runs in `predev` + `prebuild` |
| S10 | **Migrations use a dual-write pattern** — if an `fg_*` collection ever needs to reshape, create `fg_*_v2` and dual-write, never mutate the original | Documented in every migration PR |

> If a rule here appears to block a necessary action, do **not** work around it. Document the conflict in the PR description and ask for explicit written approval.

---

## 1. Architecture target

```
┌───────────────────────────────────────────────────┐
│   Pages & components                              │
│   (Guard · Manager · CSO · Dealer)                │
│                                                   │
│   ❌ never import firebase/firestore directly     │
└─────────────────────┬─────────────────────────────┘
                      │ imports from
                      ▼
┌───────────────────────────────────────────────────┐
│   /app/_services/*  (DAL)                         │
│   driverService · tripService · vehicleService …  │
│   All calls assert path.startsWith("fg_")         │
└─────────────────────┬─────────────────────────────┘
                      │ imports from
                      ▼
┌─────────────────────┐      ┌───────────────────────┐
│  /app/_lib/firebase │      │ /app/_lib/firebaseAdm │
│  (client SDK)       │      │ (admin SDK — server)  │
└─────────────────────┘      └──────────┬────────────┘
                                        │ imported ONLY by
                                        ▼
                          ┌───────────────────────────┐
                          │  /app/api/*/route.ts      │
                          │  qr · pin · face · checks │
                          │  audit · reports · bg     │
                          └───────────────────────────┘
```

### Directory deltas (new files only — nothing deleted)

```
/app
  /_lib
    firebase.ts           ← NEW · client SDK
    firebaseAdmin.ts      ← NEW · admin SDK
    config.ts             ← NEW · TRIP_SOURCE flag + thresholds
    fg-paths.ts           ← NEW · collection constants + runtime assertion
    sms.ts                ← NEW · MSG91 wrapper
    audit.ts              ← NEW · writeAuditLog helper
    types.ts              ← EXISTING, extend only (no renames)
    mockData.ts           ← EXISTING, kept until Phase 12 cut-over
    utils.ts              ← EXISTING
  /_services              ← NEW FOLDER
    index.ts              ← barrel
    tripDataService.ts    ← abstraction for TRIP_SOURCE
    tripService.ts
    tripStopService.ts
    driverService.ts
    driverBackgroundService.ts
    vehicleService.ts
    contractorService.ts
    gateEventService.ts
    inboundEntryService.ts
    visitorService.ts
    alertService.ts
    incidentService.ts
    complianceService.ts
    userService.ts
    auditService.ts
  /api                    ← NEW FOLDER
    /qr/generate/route.ts
    /pin/generate/route.ts
    /pin/verify/route.ts
    /face/compare/route.ts
    /checks/driver/route.ts
    /checks/vehicle/route.ts
    /checks/override/route.ts
    /bg/trigger/route.ts
    /bg/webhook/route.ts
    /audit/write/route.ts
    /reports/export/route.ts
  /_hooks                 ← NEW FOLDER
    useAuth.ts
    useWarehouse.ts
    useRealtime.ts
/scripts
  preflight.ts            ← NEW · Firebase projectId guard
  seed-fg.ts              ← NEW · seeds only empty fg_* collections
firestore.rules           ← NEW · additive only
firestore.indexes.json    ← NEW · additive only
.env.local                ← NEW · env vars template in docs, not committed
```

### New collections (all `fg_*` prefixed, all brand-new)

| Collection | Purpose | Brief ref | Mutability |
|---|---|---|---|
| `fg_organisations` | Tenants | §5 | Read/write (managers+) |
| `fg_warehouses` | Sites | §5 | Read/write (managers+) |
| `fg_users` | App users | §5 | Read/write (self + managers+) |
| `fg_contractors` | 3PL partners | §5 | Read/write (managers+) |
| `fg_drivers` | Driver roster | §5 | Read/write (managers+) |
| `fg_driver_background` | BG check history | §5 | Append-only writes |
| `fg_vehicles` | Vehicle compliance | §5 | Read/write (managers+) |
| `fg_gate_events` | Every gate in/out | §5 | **Immutable** after create |
| `fg_inbound_entries` | Inbound vendor trucks | §5 | Read/write |
| `fg_visitor_entries` | Visitor/contractor log | §5 | Read/write |
| `fg_trips` | Outbound delivery trips | §5 | Read/write (managers+) |
| `fg_trips/{id}/fg_trip_stops` | Subcollection — stops per trip | §5 | Read/write |
| `fg_compliance_checks` | Check audit log | §5 | Append-only |
| `fg_alerts` | Alert inbox | §5 | Create + update (ack/resolve) |
| `fg_incidents` | Incident management | §5 | Create + update |
| `fg_audit_events` | Immutable audit trail | §5 | **Append-only** |
| `fg_bg_screening_requests` | BG vendor request log | §5 | Read/write |

> Every collection here is **new**. None of these names are used by anything else in the target Firebase project — any collision is a stop-the-line event and requires written approval before proceeding.

---

## 2. Phases

Each phase has **Goals · Files · New collections touched · Exit criteria · Safety notes**. Follow them in order.

### Phase 0 — Environment & safety rails

**Goals:** Establish the Firebase project link, env var contract, and the preflight guard that blocks destructive operations from day one.

**Files**
- `.env.local.example` (committed) + `.env.local` (gitignored)
- `scripts/preflight.ts` — reads `FIREBASE_ADMIN_PROJECT_ID`, asserts it matches the expected FleetGuard project slug from config, prints a fat warning banner listing all existing collections it detects, and aborts `dev`/`build` if any non-`fg_` write path is referenced in the codebase
- `package.json` scripts: `predev`, `prebuild`, `preflight`, `seed:fg`
- `eslint.config.mjs` — add `no-restricted-syntax` for `collection(db, "…")` calls where string literal doesn't start with `fg_`; add import boundary rule: only `/app/api/*` may import `firebaseAdmin`

**New collections touched:** None — Phase 0 is read-only

**Exit criteria**
- `npm run preflight` exits 0 against the empty project, prints the project ID, and lists `fg_*` collections detected (should be zero initially)
- Attempting to write a `collection(db, "users")` in any file fails ESLint

**Safety notes**
- If preflight finds any non-`fg_` writes in the codebase, it refuses to let `dev` or `build` start
- Preflight also refuses to run if `NODE_ENV === "production"` and `FIREBASE_ADMIN_PROJECT_ID` is unset (no silent prod writes)

---

### Phase 1 — Config + fg-paths guard

**Goals:** Lock in the `TRIP_SOURCE` flag, compliance thresholds, and a single source of truth for collection names.

**Files**
- `/app/_lib/config.ts` — `tripSource`, `faceMatch` thresholds, `dlExpiry` days, `escalation` minutes (copy from brief §6)
- `/app/_lib/fg-paths.ts` — named constants for every collection (`FG_DRIVERS = "fg_drivers"` etc.) + a runtime helper:

  ```ts
  export function assertFgPath(path: string) {
    if (!path.startsWith("fg_")) {
      throw new Error(`REFUSED: ${path} is not an fg_* path`);
    }
    return path;
  }
  ```

**New collections touched:** None

**Exit criteria**
- Every future service file imports `FG_*` constants from `fg-paths.ts`
- Calling `assertFgPath("users")` throws; `assertFgPath("fg_drivers")` returns the string

**Safety notes**
- Any PR that hard-codes a collection string literal outside `fg-paths.ts` is rejected in review

---

### Phase 2 — Firebase init (client + admin)

**Goals:** Wire both SDKs with strict import boundaries.

**Files**
- `/app/_lib/firebase.ts` — client SDK, exports `auth`, `db`, `storage`. Imported **only** by service files
- `/app/_lib/firebaseAdmin.ts` — admin SDK, exports `adminDb`, `adminAuth`. Imported **only** by `/app/api/*/route.ts`
- `firestore.rules` — initial version with ONLY the `fg_*` paths whitelisted; everything else denied. Follows brief §5 rules (audit append-only, gate events immutable, manager-role gating)
- `firestore.indexes.json` — add composite indexes for the queries we know are coming (`fg_drivers` by `orgId` + `dlNumber`, `fg_trips` by `warehouseId` + `status`, etc.)

**New collections touched:** None — rules file only describes shapes

**Exit criteria**
- `firebase emulators:start` boots with the new rules
- Importing `firebaseAdmin` from a component throws a lint error
- The rules file does not touch any non-`fg_*` paths (review diff manually)

**Safety notes**
- **Do not deploy rules yet.** Rules deploy lives in Phase 12 with a full rollback script on standby
- Rules file is additive — it must not contain `allow read/write: if false` for any pre-existing non-`fg_*` path because such rules don't exist yet and we must not write catch-all denies that could shadow other apps' rules. Instead, scope all new match blocks to `fg_*` only

---

### Phase 3 — Data Access Layer (services)

**Goals:** Implement every DAL service from brief §7. Each service file contains only functions that read/write an `fg_*` path, using `assertFgPath` at every entry.

**Files (one per entity, order-sensitive because trips need drivers/vehicles/contractors to exist)**
1. `userService.ts`
2. `contractorService.ts` (supports `createQuick` for guard-side inline add)
3. `driverService.ts`
4. `driverBackgroundService.ts` (separate collection — brief §14 rule 14)
5. `vehicleService.ts`
6. `gateEventService.ts` — **create only**, no update/delete methods exist in the file
7. `inboundEntryService.ts`
8. `visitorService.ts`
9. `tripService.ts`, `tripStopService.ts`
10. `tripDataService.ts` — the abstraction layer (manual vs SuperProcure)
11. `alertService.ts`, `incidentService.ts`, `complianceService.ts`
12. `auditService.ts` — **reads only** (writes happen server-side in `/api/audit/write/route.ts`)

**New collections touched:** All 17 `fg_*` collections — **created lazily** on first write (Firestore autocreate). Phase 3 itself creates no data; `seed-fg.ts` (Phase 4) populates.

**Exit criteria**
- Every service has unit tests running against the Firebase emulator
- `assertFgPath` is called in every function that references a collection string
- `rg "collection\(db"` returns matches only inside `/app/_services`
- Type signatures match brief §4 exactly — no `any`

**Safety notes**
- No service exposes a `delete…` method unless the brief explicitly allows soft-deactivate (`isActive: false`). Hard deletes don't exist in the DAL vocabulary.
- `driverService` must not include any `contractorId` field (brief §14 rule 13)
- `gateEventService` has **no update or delete** method — period

---

### Phase 4 — Auth + seed

**Goals:** Working sign-in, role redirect, and seed a POC workspace with 1 org + 1 warehouse + 3 users.

**Files**
- `/app/_hooks/useAuth.ts` — Firebase Auth state, user profile fetch from `fg_users`
- `/app/_hooks/useWarehouse.ts` — current warehouse context for the logged-in user
- `/app/_components/RoleGuard.tsx` — redirects away from routes the user's role can't access
- `/app/login/page.tsx` — wire the existing UI to `signInWithEmailAndPassword`
- `/app/page.tsx` — server component that reads the user's role and redirects to `/guard`, `/manager`, or `/cso`
- `scripts/seed-fg.ts` — **only writes to empty `fg_*` collections**; aborts if any target collection already has documents

**New collections touched:** `fg_organisations`, `fg_warehouses`, `fg_users`

**Exit criteria**
- `npm run seed:fg` creates exactly: 1 org (FleetGuard POC), 1 warehouse (Bhiwandi Hub), 3 users (guard@, manager@, cso@)
- Logging in with any of the three seeded accounts redirects to the correct home route
- Re-running `seed:fg` on a non-empty target is a no-op and prints "already seeded"

**Safety notes**
- Seed script **must** check `getDocs(collection).empty` before inserting anything. If not empty, bail out with a loud error. Never overwrite.
- Seed passwords are written into the runner's local env only — never committed

---

### Phase 5 — API routes

**Goals:** Server-side implementations of the compliance, QR, PIN, face, and audit endpoints from brief §8.

**Files (in build order)**
1. `/app/api/checks/driver/route.ts` — DL + BG check composition
2. `/app/api/checks/vehicle/route.ts` — RC + insurance + fitness + PUC
3. `/app/api/checks/override/route.ts` — manager override path, writes audit
4. `/app/api/audit/write/route.ts` — single entry point for audit writes (called by other routes)
5. `/app/api/qr/generate/route.ts` — signs JWT with `QR_SECRET`, writes `qrToken` to trip, returns PNG
6. `/app/api/pin/generate/route.ts` — bcrypt hash, SMS via MSG91; **never returns the plain PIN**
7. `/app/api/pin/verify/route.ts` — verify + lockout after 3 attempts + alert on lock
8. `/app/api/face/compare/route.ts` — Google Cloud Vision face-detection composition, writes alerts on mismatch
9. `/app/api/bg/trigger/route.ts`, `/app/api/bg/webhook/route.ts` — BG vendor integration
10. `/app/api/reports/export/route.ts` — CSV export

**New collections touched:** `fg_gate_events` (create), `fg_compliance_checks` (create), `fg_alerts` (create), `fg_audit_events` (create), `fg_bg_screening_requests` (create)

**Exit criteria**
- Every route has an integration test against the emulator covering happy path + one failure path
- `/api/pin/verify` never includes the PIN in any response body, log line, or error message (test asserts this)
- Overrides always produce a row in `fg_audit_events` with the user ID + reason text
- Face-compare mismatch always produces a row in `fg_alerts`

**Safety notes**
- Env var `QR_SECRET` must be verified non-empty at route module load; server refuses to start otherwise
- `fg_audit_events.add()` calls never use `.set(…, {merge: true})` — pure creates only
- Same for `fg_gate_events`

---

### Phase 6 — Guard flows wired to services

**Goals:** Replace the mock data imports in every `/app/guard/**` page with real service calls and real API invocations.

**Files (update existing — do NOT replace mockData.ts yet)**
- `/app/guard/page.tsx` — read `gateEvents` + `alerts` from services, not mock
- `/app/guard/active-events/page.tsx` — real-time subscription via `useRealtime`
- `/app/guard/truck-entry/page.tsx` — **client component** — calls `/api/checks/driver`, `/api/checks/vehicle`, and writes via `gateEventService.create`
- `/app/guard/visitor-entry/page.tsx` — writes via `visitorService`
- `/app/guard/confirm-departure/page.tsx` — calls `/api/qr/generate` + `/api/pin/generate`, writes via `tripService`
- `/app/guard/trip-return/page.tsx` — calls `/api/face/compare`, updates stops
- `/app/guard/close-trip/page.tsx` — closes trip + surfaces outstanding incidents
- `/app/_components/WebcamCapture.tsx` — **new** — real `getUserMedia` capture
- `/app/_components/StopReconciliation.tsx` — **new** — extracted from the return-flow page

**New collections touched:** `fg_gate_events`, `fg_inbound_entries`, `fg_visitor_entries`, `fg_trips`, `fg_trip_stops`, `fg_alerts`

**Exit criteria**
- Guard can complete the full outbound lifecycle end-to-end on real Firebase: truck in → trip create → invoice entry → depart → QR → dealer confirm → truck return → face compare → reconcile → close
- Guard can complete the inbound lifecycle end-to-end
- Guard can complete a visitor lifecycle end-to-end
- **Mock data still imports where pages haven't been converted yet** — this phase is incremental

**Safety notes**
- When a page switches to a real service call, confirm no mock fallback remains for that page (avoid "looks working but silently reads mock")
- Webcam capture must not upload full base64 to Firestore — use Firebase Storage + reference URL, all files under `fg_gate_events/{eventId}/...`

---

### Phase 7 — Manager module realtime

**Goals:** Dashboards, trips, drivers, vehicles, visitors, contractors, alerts, incidents all reading from Firestore in real-time.

**Files (update existing)**
- `/app/manager/page.tsx` — `useRealtime` for trips + alerts + gate events
- `/app/manager/trips/page.tsx`, `/app/manager/trips/[id]/page.tsx` — trip detail is new
- `/app/manager/trips/create/page.tsx` — **new** — manual trip creation (POC only, hidden when `TRIP_SOURCE=superprocure`)
- `/app/manager/drivers/page.tsx`, `/app/manager/drivers/[id]/page.tsx` — driver profile + BG history is new
- `/app/manager/vehicles/page.tsx`
- `/app/manager/visitors/page.tsx`
- `/app/manager/contractors/page.tsx` — inline "complete details" drawer that flips `isComplete: true` and writes audit
- `/app/manager/alerts/page.tsx` — ack/resolve actions write to `fg_alerts`
- `/app/manager/incidents/page.tsx` — assign/resolve/close actions + evidence upload to Storage

**New collections touched:** Reads all `fg_*`; writes `fg_trips`, `fg_trip_stops`, `fg_contractors` (updates), `fg_alerts` (updates), `fg_incidents` (create + update), `fg_audit_events` (via /api/audit/write)

**Exit criteria**
- Every table that currently reads from mockData imports from a service instead
- Ack'ing an alert updates the UI within 300ms via `onSnapshot`
- Creating a trip from `/manager/trips/create` writes both `fg_trips` and the subcollection `fg_trip_stops`

**Safety notes**
- Contractor "complete details" drawer writes `isComplete: true` — **never** deletes the old incomplete record
- Manager override action (used when compliance blocks a gate entry) goes through `/api/checks/override` so the audit trail is guaranteed

---

### Phase 8 — CSO module realtime

**Goals:** Pan-India live view, compliance clock drill-downs, incident triage, audit trail, warehouse grid — all real-time Firestore reads.

**Files (update existing)**
- `/app/cso/page.tsx` — replace mock compliance clock with aggregated reads
- `/app/cso/warehouses/page.tsx` — reads `fg_warehouses` + aggregate stats
- `/app/cso/live-map/page.tsx` — reads `fg_trips` + `fg_alerts` for pin colors
- `/app/cso/alerts/page.tsx` — global alert feed with live subscribe
- `/app/cso/incidents/page.tsx` — pan-India incident table
- `/app/cso/compliance/page.tsx` — drill-down lists hit `fg_drivers`, `fg_vehicles`, `fg_contractors`
- `/app/cso/audit/page.tsx` — paginated reads of `fg_audit_events`

**New collections touched:** Reads only. CSO-level writes are rare (declare incident, export report).

**Exit criteria**
- Compliance clock counts match raw Firestore queries (verify by running the same query in the emulator)
- Live map pin colors update within 500ms of an alert being created in another window
- Audit trail is paginated (`startAfter` cursors), not loaded in full

**Safety notes**
- CSO reports export must stream rather than load the whole audit collection into memory

---

### Phase 9 — Alert engine

**Goals:** Server-side firing of every alert type from brief §4 so the inboxes self-populate.

**Files**
- `/app/_lib/alertEngine.ts` — pure functions that take a domain event and return an `Alert` payload
- Hooks into: `/api/checks/driver` (dl_expired / dl_expiring / bg_*), `/api/checks/vehicle` (vehicle_expired), `/api/face/compare` (face_mismatch / dl_mismatch_at_exit / vehicle_mismatch_at_exit), `/api/pin/verify` (pin_locked), scheduled cron route `/api/cron/overdue/route.ts` for trip_overdue, delivery_overdue, visitor_overdue, contract_expiring

**New collections touched:** `fg_alerts` (create), `fg_audit_events` (create)

**Exit criteria**
- Every alert type from §4 can be triggered in a scripted scenario
- Cron route is idempotent — running it twice on the same minute creates zero duplicate alerts
- 30-minute escalation from brief §6 `escalation.criticalToCSO` routes alerts to `escalatedTo` + `escalatedAt`

**Safety notes**
- The alert engine **must** de-dupe by `(type, entityId, status=open)` — avoid alert storms when a flaky doc check runs repeatedly
- Cron hits `/api/cron/overdue` via a signed header; route rejects unsigned calls

---

### Phase 10 — Reports & audit export

**Goals:** MIS CSV export from brief §11 + full audit export for compliance handoff.

**Files**
- `/app/api/reports/export/route.ts` — CSV streaming
- `/app/manager/reports/page.tsx` — **new** — filters + download button
- `/app/cso/audit/page.tsx` — adds "Export 24h" button that streams a signed CSV

**New collections touched:** Reads only

**Exit criteria**
- 100k-row audit export completes without loading it all in memory
- Manager MIS export matches the sample columns in brief §13 step 30

---

### Phase 11 — End-to-end lifecycle tests

**Goals:** Scripted browser tests that walk through brief §13 steps 31–33 against an emulator.

**Files**
- `tests/e2e/outbound-lifecycle.spec.ts` — full loaded-truck lifecycle
- `tests/e2e/inbound-lifecycle.spec.ts` — vendor truck in + out
- `tests/e2e/mismatch-scenario.spec.ts` — face mismatch at exit → alert → incident → CSO view

**New collections touched:** All writes happen under `fg_*`; tests assert post-state

**Exit criteria**
- All three E2E specs pass against the emulator
- CI runs them on every PR

---

### Phase 12 — Cut-over: remove mockData imports

**Goals:** Final deletion of the mock data import statements from pages — the mockData.ts file itself stays around as reference/seed source until Phase 13.

**Files**
- `rg "from .*_lib/mockData"` must return zero results in `/app/guard`, `/app/manager`, `/app/cso`, `/app/deliver`
- `mockData.ts` keeps its exports (used by `seed-fg.ts` for a POC demo seed)

**New collections touched:** None

**Exit criteria**
- Full build passes with `USE_FIRESTORE=1` and no mock fallback anywhere
- Toggling a feature flag in `_lib/config.ts` between `data: "mock"` and `data: "firestore"` is not needed — firestore is the only path

**Safety notes**
- Deploy Firestore rules from Phase 2 **only now**, after the emulator tests pass
- Deploy in staging first, wait 24 h, then prod

---

### Phase 13 — Post-launch hardening

- Monitoring: Cloud Logging alerts on non-`fg_*` write attempts (defence in depth)
- Backup: daily export of every `fg_*` collection to a cold bucket
- Runbook: what to do if an `fg_*` collection fills up / an alert storm starts
- Quarterly review of the safety contract

---

## 3. Rollback plan

If anything goes wrong at any phase:

1. **Code rollback** — revert the merge commit; all previous phases keep working because nothing was deleted
2. **Data rollback** — impossible by design: nothing was deleted, so there's nothing to restore. Any bad `fg_*` writes can be soft-deleted (`isActive: false`) or ignored
3. **Rules rollback** — `firestore.rules` ships with a safe previous version alongside; `firebase deploy --only firestore:rules` with the old file restores within 30 s
4. **If an existing (non-`fg_*`) collection has been touched accidentally** — stop all writes immediately, pull logs, escalate. This should be impossible if Phase 0 rails held.

---

## 4. Not in scope for this plan

Out of scope deliberately:
- Modifying or deleting any pre-existing Firebase resource (collections, rules, indexes, auth users)
- SuperProcure production integration — lives behind `TRIP_SOURCE=superprocure` and is a separate workstream
- SAP integration — future
- GPS, driver app, dealer app — never in scope per brief §1

---

## 5. Open questions for stakeholders

1. What is the target Firebase `projectId`? Must be hard-coded in `scripts/preflight.ts` to prevent cross-project writes
2. Are any `fg_*` collections already present in the target project from a previous attempt? If yes, name them — we need to decide read-only vs dual-write
3. Is there an existing Google Cloud Vision API key, or do we provision a new one?
4. Which MSG91 template ID is the dealer PIN SMS approved against?
5. Who owns the BG vendor webhook shared secret?

Answers to these unblock Phase 0.

---

*Document version 0.1 — every phase above obeys the safety contract in §0. Update this file (don't replace it) as phases land.*
