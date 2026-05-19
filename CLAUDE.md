@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The `@AGENTS.md` import above is **load-bearing** — it carries the mandatory Firestore Collection Safety contract (the `fg_*` prefix rule, append-only collections, `assertFgPath()` requirement). Read it first.

## Tech stack pins (deviate from training data)

- **Next.js 16.2.3 (App Router, Turbopack)** — `params` and `searchParams` in page/layout components are `Promise<…>` and **must be `await`ed**. Read `node_modules/next/dist/docs/` for current API surface before writing route handlers, layouts, or middleware.
- **React 19.2** with **TypeScript strict** mode.
- **Tailwind CSS v4** with `@theme` CSS variables in `app/globals.css`. There is **no `tailwind.config.js`** — do not create one or apply v3 config patterns.
- **Firebase 12.x**: client SDK (`firebase`) for pages/services, Admin SDK (`firebase-admin`) for API routes only.
- Validation: `zod`. Auth helpers: `bcryptjs`, `jose`. QR: `qrcode`. Excel export: `exceljs`. Mail: `nodemailer`. SMS: MSG91 (custom wrapper in `app/_lib/sms.ts`).

## Commands

```bash
npm run dev                # next dev (runs preflight via predev hook)
npm run build              # next build (runs preflight via prebuild hook)
npm run start              # production server
npm run lint               # eslint (enforces S1 + S8 safety rules — see below)
npm run format             # prettier write on app/**/*.{ts,tsx} and scripts/**/*.ts
npm run format:check       # prettier check (no writes)
npm run preflight          # run safety checks manually (also runs auto pre-dev/build)

# Seeds & one-shot scripts (all run via tsx)
npm run seed:fg                 # seed FG collections with demo data
npm run seed:itc                # seed ITC-specific data
npm run create:superadmin       # bootstrap a superadmin Firebase Auth + fg_users doc
npm run create:companyadmin     # create a company admin

# DocuFast migration utilities
npm run export:docufast
npm run analyze:docufast
npm run migrate:docufast
npm run test:migrate10
```

To bypass preflight in emergencies: `SKIP_PREFLIGHT=1 npx next build` (still avoid this — preflight catches the safety rule violations).

There is no test runner configured in this repo. UI changes need to be exercised in a browser against `npm run dev`.

## The preflight gate (`scripts/preflight.ts`)

`predev` and `prebuild` hooks run preflight. It will **abort startup** on:

- **S3 — Project ID mismatch.** `FIREBASE_ADMIN_PROJECT_ID` must equal `FLEETGUARD_PROJECT_ID`. This is the safety wire that prevents writes against the wrong shared Firebase project. The Firebase project alias in `.firebaserc` is `docu-fast` — that's the shared project; FleetGuard's data lives only inside `fg_*` collections within it.
- **S1 — Bare non-`fg_*` collection literal** anywhere in source (ripgrep scan for `collection(db, "...")` not starting with `fg_`).
- **S8 — Admin SDK import boundary violation.** `firebaseAdmin` imported anywhere outside `app/api/**`.
- **S7 — Missing secrets in non-mock mode.** When `TRIP_SOURCE !== "mock"`, `QR_SECRET` and `FIREBASE_ADMIN_PRIVATE_KEY` must be set; `MSG91_AUTH_KEY` produces a warning.

ESLint enforces S1 and S8 statically too (see `eslint.config.mjs`). If ESLint fires on `collection(db, "...")` or on a `firebaseAdmin` import, **do not silence it** — fix the call site:
- For S1: import the constant from `app/_lib/fg-paths.ts`.
- For S8: move the Admin SDK call into an `app/api/*/route.ts` and call it from the client.

## Architecture (the big picture)

Three strict layers with one-way imports — violations break the build.

```
Pages / Components  ─┐
  (app/<role>/**)    │  imports → _components, _contexts, _hooks, _services/*
                     │  NEVER imports firebaseAdmin
                     ▼
Services             ─┐
  (app/_services/*)   │  imports → _lib/firebase (CLIENT SDK), _lib/fg-paths, _lib/types
                      │  Every write goes through assertFgPath()
                      ▼
Firebase Client SDK
  (app/_lib/firebase.ts)

API Routes           ─┐
  (app/api/**/route.ts)│  imports → _lib/firebaseAdmin (ADMIN SDK), _lib/fg-paths, _lib/types
                       │  NEVER imports _lib/firebase (client SDK)
                       ▼
Firebase Admin SDK
  (app/_lib/firebaseAdmin.ts)
```

**Why this matters.** Pages and services use the client SDK so security rules apply (defense-in-depth against bugs). Privileged operations — creating users, writing audit events, signing QR tokens, generating/verifying PINs, OCR, face compare, exports — must run server-side because they need Admin SDK power, secrets (`QR_SECRET`, `FIREBASE_ADMIN_PRIVATE_KEY`), or third-party API keys that cannot ship to the browser. ESLint rule (S8) enforces the boundary; preflight double-checks it with ripgrep.

### Path constants (`app/_lib/fg-paths.ts`)

Single source of truth for every Firestore collection name. Import the constant, never the string literal:

```typescript
// In a service (client SDK)
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../_lib/firebase";
import { FG_DRIVERS, assertFgPath } from "../_lib/fg-paths";

const snap = await getDocs(
  query(collection(db, assertFgPath(FG_DRIVERS)), where("orgId", "==", orgId))
);

// In an API route (Admin SDK)
import { adminDb } from "../_lib/firebaseAdmin";
import { FG_DRIVERS, assertFgPath } from "../_lib/fg-paths";

const doc = await adminDb.collection(assertFgPath(FG_DRIVERS)).doc(driverId).get();
```

`assertFgPath()` throws at runtime if a path doesn't begin with `fg_`. Call it on **every write** (and ideally every read). `fg_audit_events` and `fg_gate_events` are append-only — no `update`, no `delete`, ever. To reshape an existing `fg_*` collection, dual-write to `fg_*_v2` (rule S10).

### Roles, portals, and auth flow

```
SuperAdmin  (bootstrap: npm run create:superadmin)
  └─ Company Admin  (created in /superadmin)
       └─ Guard | CSO | Warehouse Manager | Regional Manager
             (created in /company/users)
```

| Role | Portal route |
|---|---|
| `superadmin` | `/superadmin` |
| `company_admin` | `/company` |
| `guard` | `/guard` |
| `wh_manager` | `/manager` (locked to `warehouseId`) |
| `regional_manager` | `/manager` (multi-warehouse) |
| `cso` | `/cso` |

Login flow: `/login` → Firebase Auth → role read from `fg_users` → `/auth/redirect` routes by role → `RoleGuard` on each portal layout enforces correct role. User creation is server-side via `POST /api/users/create` (Admin SDK creates Firebase Auth account + `fg_users` doc atomically).

### Public surface

- `/deliver/[token]` — dealer delivery confirmation page. **Bundle must stay under 50 KB** (Requirementdoc.md §14). No client SDK initialization on this route — it's intentionally minimal.

### API routes (current set)

Server-only operations live under `app/api/**/route.ts`. Notable groups:

- **Auth/users**: `users/create`, `users/reset-password`, `auth/forgot-password`
- **Compliance checks**: `checks/driver`, `checks/vehicle`, `checks/override`
- **Background screening**: `bg/trigger`, `bg/webhook`, `crimecheck/initiate`, `crimecheck/poll/[caseId]`
- **Verification**: `verify/dl`, `dl-ocr`, `face/compare`
- **Delivery flow**: `qr/generate`, `pin/generate`, `pin/verify`
- **Storage**: `photo-upload`, `photo-upload/from-url`
- **Audit & reports**: `audit/write` (append-only), `reports/export`
- **Tickets**: `support-tickets`, `support-tickets/[id]`
- **Mock helpers**: `mock/vision`, `mock/driver-checks` (used when `TRIP_SOURCE=mock`)

PINs, QR tokens, and raw face-compare scores never leave the server (S7).

### Runtime configuration (`app/_lib/config.ts`)

Tunables — face-match thresholds, expiry warning windows, alert escalation timing, incident SLA windows by type, PIN policy, visitor overstay, trip overdue threshold — all live here, driven by env vars where applicable. The `TRIP_SOURCE` flag (`mock` | `firestore` | `superprocure`) selects the trip data backend; `mock` is the default for local dev and bypasses several secret requirements.

### Design system conventions

- Brand palette: deep navy `#0f2347` + amber `#f59e0b` + semantic success/warning/danger.
- List views render as **tables**, not card grids (exceptions: warehouse live-map, CSO home warehouse grid, dealer pages).
- Numeric columns use the `.num` class (`font-variant-numeric: tabular-nums`).
- Status display: `Badge` for tones, `StatusPill` for state transitions.
- Sidebar icons use a **string-keyed icon registry** (not component references) so the sidebar config crosses the server/client boundary safely.
- Compliance matrix is a fixed 3×3 grid: DL × Vehicle × Contractor against 0–30 / 31–60 / 61–90 day buckets.

## Reference docs in this repo

- `AGENTS.md` — the safety contract (imported by this file).
- `.claude/ARCHITECTURE.md` — fuller architecture reference; keep in sync when architectural decisions change.
- `IMPLEMENTATION_PLAN.md` — the mock → Firebase migration plan with the full S1–S10 safety rule table.
- `Requirementdoc.md` — authoritative feature spec; **§14 is the critical-rules section** that the safety contract derives from.
- `firestore.rules` / `firestore.indexes.json` — only **add** new entries scoped to `fg_*`; never modify existing ones (rule S4).

---

## Functionality Reference (full feature map)

This section documents what every portal, page, and API does. Read this before making changes so you don't duplicate or break existing flows.

### Related Mobile App
The companion React Native app lives at `C:\Programming\itc\dl-scanner-app`. See its `CLAUDE.md` for full mobile context. The mobile app is the **primary client** for gate operations — guards use it on Android phones. The web app is the **management dashboard** used by managers, CSOs, and company admins on desktop.

---

### Database: Supabase (Postgres)
All **v2 API routes** use Supabase via `app/_server/db/client.ts`. The old Firebase/Firestore paths are legacy. New features must use v2 routes.

Key tables (snake_case in DB, camelCase in TS types):
| Table | Purpose |
|---|---|
| `fg_users` | All user accounts with role |
| `fg_organisations` | Companies/orgs |
| `fg_warehouses` | Warehouse sites |
| `fg_gates` | Gate records per warehouse |
| `fg_gate_events` | Each truck entry/exit event |
| `fg_drivers` | Driver profiles with DL info + photos |
| `fg_vehicles` | Vehicle records |
| `fg_contractors` | Service providers / transport companies |
| `fg_visitors` | Visitor entry/exit records |
| `fg_alerts` | System alerts (mismatch, DL expired, etc.) |
| `fg_incidents` | Formal incidents created from alerts or overrides |
| `fg_audit_events` | Append-only audit log |
| `fg_trips` | Trip records (inbound/outbound) |
| `fg_inbound_entries` | Inbound delivery entries |
| `fg_verify_attempts` | DL/vehicle verification attempt log |
| `fg_gate_sessions` | Guard gate sessions |
| `fg_support_tickets` | Support/help tickets |

---

### v2 API Routes (Supabase-backed, used by mobile app)

All routes are under `app/api/v2/`. Auth via `Authorization: Bearer <jwt>` validated by `getUser()`.

#### Auth
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/v2/login` | POST | Email+password login → returns JWT |
| `/api/auth/v2/logout` | POST | Invalidate session |
| `/api/auth/v2/mfa/enroll` | POST | Enroll TOTP MFA |
| `/api/auth/v2/mfa/verify` | POST | Verify MFA code |
| `/api/v2/me` | GET | Current user profile + warehouseId |
| `/api/v2/users/me` | GET/PATCH | Profile read/update |
| `/api/v2/users/me/password` | PATCH | Change password |

#### Gate Operations (primary mobile flows)
| Route | Method | Purpose |
|---|---|---|
| `/api/v2/gate-entry` | POST | **Unified entry** — creates gate event + driver + vehicle in one call. Used by TruckEntryPage and VehicleExitPage |
| `/api/v2/inside-check` | GET | Duplicate detection — is this vehicle/driver already inside? Params: `vehicleReg`, `dlNumber`, `warehouseId` |
| `/api/v2/gate-events` | GET | List gate events. Params: `warehouseId`, `status`, `limit`, `offset` |
| `/api/v2/gate-events/[id]` | GET/PATCH | Single gate event |
| `/api/v2/gate-sessions` | GET/POST | Guard gate sessions |

#### Checks & Verification
| Route | Method | Purpose |
|---|---|---|
| `/api/v2/checks/driver` | POST | DL verification (govt API) + crime check trigger |
| `/api/v2/checks/vehicle` | POST | RC verification (govt API) |
| `/api/v2/verify` | POST | Combined verify endpoint |
| `/api/dl-ocr` | POST | OCR a DL image → returns parsed DL fields |
| `/api/face/compare` | POST | Compare two face photos → similarity score |
| `/api/crimecheck/initiate` | POST | Start background screening |
| `/api/crimecheck/poll/[caseId]` | GET | Poll crime check result |

#### People & Vehicles
| Route | Method | Purpose |
|---|---|---|
| `/api/v2/drivers` | GET/POST | Driver list (search by `q`, `dlNumber`, `warehouseId`) + create |
| `/api/v2/drivers/[id]` | GET/PATCH | Single driver |
| `/api/v2/vehicles` | GET/POST | Vehicle list + create |
| `/api/v2/vehicles/[id]` | GET/PATCH | Single vehicle |
| `/api/v2/contractors` | GET/POST | Service providers. GET params: `q` (search), `warehouseId`, `orgId`, `limit` |
| `/api/v2/contractors/[id]` | GET/PATCH | Single contractor |
| `/api/v2/visitors` | GET/POST | Visitor entries. GET params: `warehouseId`, `status`, `limit` |
| `/api/v2/visitors/[id]` | GET/PATCH | Single visitor |
| `/api/v2/visitors/[id]/exit` → use PATCH on `[id]` with `exitTime` | PATCH | Check out visitor |

#### Alerts & Incidents
| Route | Method | Purpose |
|---|---|---|
| `/api/v2/alerts` | GET/POST/PATCH | Alerts. GET params: `warehouseId`, `status`, `severity`, `limit`. POST creates alert. PATCH `{id, action:'acknowledge'|'resolve'}` |
| `/api/v2/incidents` | GET/POST | Incidents list + create |
| `/api/v2/incidents/[id]` | GET/PATCH | Single incident |

#### Org & Config
| Route | Method | Purpose |
|---|---|---|
| `/api/v2/warehouses` | GET | Warehouses for org |
| `/api/v2/warehouses/[id]` | GET/PATCH | Single warehouse |
| `/api/v2/orgs` | GET | Orgs (superadmin only) |
| `/api/v2/users` | GET/POST | Users list + create |
| `/api/v2/users/[id]` | GET/PATCH/DELETE | Single user |

#### Media
| Route | Method | Purpose |
|---|---|---|
| `/api/photo-upload` | POST | Upload photo (multipart) → returns `imageUrl` |
| `/api/photo-upload/from-url` | POST | Re-upload from URL → returns `imageUrl` |

---

### Web Portals — Page by Page

#### `/guard` — Gate Guard Portal
Guards use this on desktop (fallback when not using mobile app).

| Page | Purpose |
|---|---|
| `/guard` | Dashboard: today's entries count, active alerts, quick action buttons |
| `/guard/truck-entry` | Full truck entry: DL verify → crime check → confirm entry. Service provider typeahead with "+ Add" if not found. |
| `/guard/vehicle-exit` | Vehicle exit: scan → mismatch check → confirm exit |
| `/guard/visitor-entry` | Register visitor with photo |
| `/guard/visitor-exit` | Check out visitor |
| `/guard/visitors` | All active visitors list |
| `/guard/active-events` | Open gate events (trucks inside) |
| `/guard/entry-exit-log` | Full gate event history |
| `/guard/alerts` | Active alerts for this warehouse |
| `/guard/confirm-departure` | Confirm a trip departure |
| `/guard/close-trip` | Close an active trip |
| `/guard/trip-return` | Record trip return |
| `/guard/sop` | SOP documents |

**Service Provider Dropdown (truck-entry)**: Scrollable list (max `210px` height = ~5 rows). When typed name not found → "+ Add '[name]'" row. Clicking Add calls `POST /api/v2/contractors`, auto-selects new entry.

#### `/manager` — Warehouse/Regional Manager Portal

| Page | Purpose |
|---|---|
| `/manager` | Dashboard: live stats, alerts summary, compliance matrix |
| `/manager/gate-events` | Gate event log with filters |
| `/manager/drivers` | Driver registry |
| `/manager/vehicles` | Vehicle registry |
| `/manager/contractors` | Service provider list |
| `/manager/contractors/[id]/drivers` | Drivers for a specific contractor |
| `/manager/visitors` | Visitor log |
| `/manager/incidents` | Incident management |
| `/manager/incidents/[id]` | Incident detail + timeline |
| `/manager/alerts` | Alert feed |
| `/manager/trips` | Trip management |
| `/manager/trips/new` | Create trip |
| `/manager/reports` | Excel export |
| `/manager/audit` | Audit log |

#### `/cso` — Chief Security Officer Portal

| Page | Purpose |
|---|---|
| `/cso` | Multi-warehouse overview grid |
| `/cso/drivers` | All drivers across org |
| `/cso/vehicles` | All vehicles |
| `/cso/contractors` | All service providers |
| `/cso/contractors/[id]/drivers` | Contractor driver detail |
| `/cso/warehouses` | Warehouse list |
| `/cso/live-map` | Live warehouse map |
| `/cso/incidents` | All incidents |
| `/cso/incidents/[id]` | Incident detail |
| `/cso/alerts` | All alerts |
| `/cso/compliance` | Compliance matrix (DL × Vehicle × Contractor) |
| `/cso/users` | User management |
| `/cso/audit` | Org-wide audit log |
| `/cso/reports` | Reports & exports |

#### `/company` — Company Admin Portal

| Page | Purpose |
|---|---|
| `/company` | Company overview |
| `/company/users` | Create/manage all users (guard, CSO, manager etc.) |
| `/company/warehouses` | Warehouse management |
| `/company/warehouses/[id]/gates` | Gate management per warehouse |
| `/company/service-providers` | Approve/manage service providers |
| `/company/dealers` | Dealer management |
| `/company/visitor-config` | Configure visitor types and fields |
| `/company/account` | Company account settings |

#### `/superadmin` — SuperAdmin Portal

| Page | Purpose |
|---|---|
| `/superadmin` | Platform overview |
| `/superadmin/companies` | All companies |
| `/superadmin/companies/[orgId]` | Company detail |
| `/superadmin/companies/[orgId]/users` | Company users |
| `/superadmin/companies/[orgId]/warehouses` | Warehouses |
| `/superadmin/companies/[orgId]/warehouses/[id]/gates` | Gates |
| `/superadmin/companies/[orgId]/service-providers` | SPs |
| `/superadmin/companies/[orgId]/dealers` | Dealers |
| `/superadmin/drivers` | All drivers platform-wide |
| `/superadmin/support-tickets` | All support tickets |
| `/superadmin/account` | SuperAdmin account |

---

### Key Services (`app/_services/`)

| File | What it does |
|---|---|
| `serviceProviderService.ts` | `searchServiceProviders(q, warehouseId, orgId)` — typeahead for gate entry. `createServiceProvider()` — add new SP on the fly. |
| `gateEventService.ts` | Gate event CRUD. `closeGateEvent(id)` marks event as exited. |
| `driverService.ts` | `searchDriversByDlPrefix(raw)` — autocomplete for known drivers. |
| `duplicateCheckService.ts` | `checkDuplicate({ vehicleReg, dlNumber, warehouseId })` → calls `/api/v2/inside-check` |
| `gateEntryService.ts` | `createGateEntry(payload)` → calls `POST /api/v2/gate-entry` (unified entry) |
| `dlVerifyService.ts` | DL verification with govt API |
| `rcVerifyService.ts` | RC/vehicle verification |
| `crimeCheckService.ts` | Background screening — initiate + poll |
| `incidentService.ts` | Incident CRUD |
| `visitorsEntries.ts` (in mobile) | All visitor API calls for the mobile app |
| `v2/api.ts` | Fetch wrapper for v2 API with auth cookie |

---

### Alert System

Alerts are created by the **mobile app** when:
- Driver DL not found but guard overrides → `dl_not_found` (critical)
- Expired DL but guard overrides → `dl_expired` (critical)
- DL expiring in ≤30 days → `dl_expiring` (warning)
- Crime check flagged → `bg_flagged` (critical/warning)
- Driver admitted while crime check pending → `bg_pending` (info)
- Exit mismatch (face or DL) → `dl_mismatch_at_exit` / `face_mismatch` (critical)

Alerts are **read and managed** by the web app (manager/CSO portals). Actions: `acknowledge` or `resolve`.

---

### Incident System

Incidents are auto-created server-side (`app/_server/incidents/autoCreate.ts`) from critical alerts or guard overrides. They have:
- SLA windows (by type) — escalate if not resolved in time
- Timeline / comments
- Severity levels
- Assignment to users

Cron jobs (`/api/cron/escalate-incidents`, `/api/cron/sla-warnings`) run on schedule.

---

### Design System (web)

- **Brand**: navy `#0f2347` + amber `#f59e0b`
- **No dark mode** on web — Tailwind v4, `@theme` CSS vars in `app/globals.css`, no `tailwind.config.js`
- Lists render as **tables** (not card grids) — exceptions: live-map, CSO warehouse grid, dealer pages
- `.num` class → `font-variant-numeric: tabular-nums` for number columns
- `Badge` component for status tones, `StatusPill` for state transitions
- Sidebar icons use string registry (not JSX components) — required for server/client boundary

---

### Cron Jobs

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/escalate-incidents` | Every 15 min | Escalate overdue incidents |
| `/api/cron/sla-warnings` | Every hour | Warn on SLA breach approaching |
| `/api/cron/cleanup` | Daily | Clean up old sessions |
| `/api/cron/abandoned-sessions` | Every 30 min | Close abandoned gate sessions |
| `/api/cron/create-partitions` | Monthly | Create Postgres time partitions |
