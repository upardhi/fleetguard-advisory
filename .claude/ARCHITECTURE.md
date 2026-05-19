# FleetGuard — Architecture Reference

> Source of truth for AI agents and contributors. Keep this file updated when architectural decisions change.

---

## Overview

FleetGuard is an enterprise gate & fleet security platform built as a Next.js 16 App Router application. It enforces compliance at warehouse gate entries, face-verifies driver movements, enables digital delivery confirmation (signed QR + SMS PIN), and provides security leadership with pan-India command visibility.

**Client context:** 37 warehouses, 70+ 3PL vehicles, currently paper-based gate logs. SAP instance + SuperProcure integration planned for a later phase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.3 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| UI | React 19.2, Tailwind CSS v4 (`@theme` tokens — no `tailwind.config.js`) |
| Icons | lucide-react |
| Database | Firebase Firestore (client SDK in pages, Admin SDK in API routes) |
| Auth | Firebase Authentication |
| Storage | Firebase Storage |
| Validation | zod |
| Utilities | clsx, bcryptjs, jose, qrcode |

> **Tailwind v4 note:** This project uses Tailwind v4 with `@theme` CSS variables. There is no `tailwind.config.js`. Do not attempt to add one or use v3 config patterns.

> **Next.js 16 note:** `params` and `searchParams` in page/layout components are `Promise<…>` — always `await` them. Read `node_modules/next/dist/docs/` for current API surface.

---

## Directory Structure

```
/                        ← project root (NOT /src)
├── app/                 ← Next.js App Router root
│   ├── _components/     ← Shared UI kit (server-safe)
│   ├── _contexts/       ← React context providers
│   ├── _hooks/          ← Custom React hooks
│   ├── _lib/            ← Core utilities & configuration
│   │   ├── fg-paths.ts  ← ALL collection name constants + assertFgPath()
│   │   ├── firebase.ts  ← Client SDK init (pages/components only)
│   │   ├── firebaseAdmin.ts ← Admin SDK init (API routes only)
│   │   ├── types.ts     ← Domain type definitions (mirrors brief §4)
│   │   ├── audit.ts     ← Audit logging utility
│   │   ├── mockData.ts  ← Demo/seed data
│   │   └── utils.ts     ← cx, fmt, initials, avatarHue helpers
│   ├── _services/       ← Data access layer (20+ service files)
│   ├── api/             ← Next.js API routes (Admin SDK only)
│   ├── auth/redirect/   ← Post-login role routing page
│   ├── login/           ← Split-screen SSO entry
│   ├── deliver/[token]/ ← Public dealer delivery confirmation page
│   ├── guard/           ← Guard portal (gate operations)
│   ├── manager/         ← Manager portal (fleet/trip/driver oversight)
│   ├── company/         ← Company admin portal
│   ├── superadmin/      ← Super admin portal
│   └── cso/             ← Chief Security Officer portal
├── firestore.rules      ← Firestore security rules
├── firestore.indexes.json ← Custom query indexes
├── AGENTS.md            ← Agent instructions (mandatory reading)
├── IMPLEMENTATION_PLAN.md ← Mock → Firebase migration plan
└── Requirementdoc.md    ← Authoritative feature spec (§14 = critical rules)
```

---

## Firestore Collections

**Rule: all collections owned by this project are prefixed `fg_`. Any collection not starting with `fg_` is foreign — treat it as read-only.**

All collection name constants live in `app/_lib/fg-paths.ts`. Never hardcode a collection string anywhere else. Always pass strings through `assertFgPath()` before a write.

### Collection Registry

| Constant | Collection | Notes |
|---|---|---|
| `FG_ORGANISATIONS` | `fg_organisations` | Company entities |
| `FG_WAREHOUSES` | `fg_warehouses` | Warehouse locations |
| `FG_WAREHOUSE_GATES` | `fg_warehouse_gates` | Gate config per warehouse |
| `FG_USERS` | `fg_users` | User accounts (linked to Firebase Auth) |
| `FG_CONTRACTORS` | `fg_contractors` | 3PL/contractor entities |
| `FG_DRIVERS` | `fg_drivers` | Driver records |
| `FG_DRIVER_BACKGROUND` | `fg_driver_background` | Background check results |
| `FG_VEHICLES` | `fg_vehicles` | Fleet vehicles |
| `FG_GATE_EVENTS` | `fg_gate_events` | Gate entry/exit events — **append-only** |
| `FG_INBOUND_ENTRIES` | `fg_inbound_entries` | Warehouse inbound log entries |
| `FG_VISITOR_ENTRIES` | `fg_visitor_entries` | Visitor entry tracking |
| `FG_TRIPS` | `fg_trips` | Trip records |
| `FG_TRIP_STOPS` | `fg_trip_stops` | Trip stops (subcollection under `fg_trips`) |
| `FG_COMPLIANCE_CHECKS` | `fg_compliance_checks` | Vehicle/driver/contractor compliance |
| `FG_ALERTS` | `fg_alerts` | Security alerts |
| `FG_INCIDENTS` | `fg_incidents` | Incident records |
| `FG_AUDIT_EVENTS` | `fg_audit_events` | Audit trail — **append-only** |
| `FG_BG_SCREENING_REQUESTS` | `fg_bg_screening_requests` | Background screening workflow |
| `FG_DEALERS` | `fg_dealers` | Dealer/sales entities |
| `FG_SERVICE_PROVIDERS` | `fg_service_providers` | Service provider registry |
| `FG_VISITOR_CONFIG` | `fg_visitor_config` | Visitor config per org |
| `FG_OCR` | `fg_ocr` | OCR processing records |
| `FG_VERIFY_ATTEMPTS` | `fg_verify_attempts` | Verification attempt logs |

**Storage path** (not a Firestore collection): `fg_photos/` — Firebase Storage folder for uploaded images.

---

## Import Boundaries (enforced)

```
Pages / Components
  └─ import from: _components, _contexts, _hooks, _lib/firebase.ts, _services/
  └─ NEVER import: firebaseAdmin.ts (server-only credential file)

API Routes (/app/api/**/route.ts)
  └─ import from: _lib/firebaseAdmin.ts, _lib/fg-paths.ts, _lib/types.ts
  └─ NEVER import: firebase.ts (client SDK has no place in API routes)

Services (_services/*.ts)
  └─ import from: _lib/firebase.ts, _lib/fg-paths.ts, _lib/types.ts
  └─ Use client Firestore SDK (collection, query, doc, etc.)
```

---

## User Hierarchy & Auth

```
SuperAdmin  (hardcoded — bootstrap via: npm run create:superadmin)
  └─ Company Admin  (created by SuperAdmin inside /superadmin)
       └─ Guard | CSO | Warehouse Manager | Regional Manager
             (created by Company Admin inside /company/users)
```

| Role | Portal | Notes |
|---|---|---|
| `superadmin` | `/superadmin` | All orgs, company admins, warehouses, dealers, service providers |
| `company_admin` | `/company` | Own org only — users, warehouses, dealers, service providers, gates |
| `guard` | `/guard` | Gate operations |
| `wh_manager` | `/manager` | Fleet/trip/driver oversight; locked to assigned warehouse |
| `regional_manager` | `/manager` | Multi-warehouse oversight |
| `cso` | `/cso` | Pan-company visibility |

**Auth flow:** `/login` → Firebase Auth → role from `fg_users` → `/auth/redirect` routes by role → `RoleGuard` on each layout blocks wrong-role access.

**User creation:** POST `/api/users/create` — Admin SDK creates Firebase Auth account + `fg_users` doc atomically.

---

## Data Access Pattern

```typescript
// In a service (client SDK)
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../_lib/firebase";
import { FG_DRIVERS } from "../_lib/fg-paths";

const snap = await getDocs(query(collection(db, FG_DRIVERS), where("orgId", "==", orgId)));

// In an API route (Admin SDK)
import { adminDb } from "../_lib/firebaseAdmin";
import { FG_DRIVERS } from "../_lib/fg-paths";

const doc = await adminDb.collection(FG_DRIVERS).doc(driverId).get();
```

---

## Design System Conventions

- **Brand palette:** deep navy `#0f2347` + amber accent `#f59e0b` + semantic success/warning/danger
- **Layout pattern:** all list views use tables — not card grids (except: warehouse live-map, warehouse grid on CSO home, dealer pages)
- **Numerics:** use `.num` class (`font-variant-numeric: tabular-nums`)
- **Status chips:** `Badge` component with semantic tones; `StatusPill` for state transitions
- **Sidebar icons:** string-keyed icon registry (not component references) — safe across server/client boundary
- **Compliance matrix:** 3×3 grid (DL / Vehicle / Contractor × 0–30 / 31–60 / 61–90 days)

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/users/create` | POST | Create Firebase Auth + fg_users doc (Admin SDK) |
| `/api/checks/driver` | POST | Driver compliance check |
| `/api/checks/vehicle` | POST | Vehicle compliance check |
| `/api/checks/override` | POST | Compliance override |
| `/api/bg/trigger` | POST | Trigger background screening |
| `/api/bg/webhook` | POST | Receive background screening result |
| `/api/qr/generate` | POST | Generate delivery QR token |
| `/api/pin/generate` | POST | Generate SMS PIN |
| `/api/pin/verify` | POST | Verify SMS PIN |
| `/api/face/compare` | POST | Face match verification |
| `/api/crimecheck` | POST | Crime record check |
| `/api/dl-ocr` | POST | OCR processing for driver licence |
| `/api/photo-upload` | POST | Upload photo to Firebase Storage |
| `/api/audit/write` | POST | Write audit event (append-only) |

---

## Key Constraints from Requirementdoc.md §14

1. All Firestore paths must start with `fg_` — runtime-enforced via `assertFgPath()`.
2. `fg_audit_events` and `fg_gate_events` are immutable after document creation — no updates, no deletes.
3. Driver–contractor association is per gate event only; no permanent link exists in `fg_drivers`.
4. The `deliver/[token]` page bundle must stay under 50 KB.
5. Collections not prefixed `fg_` are **foreign and read-only** — this Firebase project is shared.
