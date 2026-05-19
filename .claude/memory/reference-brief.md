---
name: FleetGuard delivery brief
description: Authoritative spec for FleetGuard POC — §4 types, §5 collections, §7 DAL rules, §8 API routes, §13 build order, §14 critical rules
type: reference
originSessionId: c5b2b0e4-cc0b-4bfb-9858-bdb3dfdef04f
---
The FleetGuard build brief lives at **`Requirementdoc.md`** at the project root (`D:\_Analysis_\fleetg\Requirementdoc.md`). Every architectural decision (collection naming, DAL pattern, critical rules) is locked in there — always consult before a structural change.

**Key sections to re-read when in doubt:**
- **§3** Project structure — the brief says `/src/app` but the working project is flat `/app/` (do not restructure)
- **§4** TypeScript types — source of truth for the domain model (User, Driver, Vehicle, Trip, TripStop, GateEvent, etc.)
- **§5** Firestore collections — all `fg_*` prefixed; security rules snippet included
- **§6** Firebase setup — client SDK in `/lib/firebase.ts`, admin SDK in `/lib/firebaseAdmin.ts`
- **§7** Data Access Layer rule — components NEVER import firebase directly; only from `/services`. Swapping backends only requires rewriting service files.
- **§8** API routes — `/api/qr/generate`, `/api/pin/generate`, `/api/pin/verify`, `/api/face/compare`, `/api/checks/driver`, `/api/checks/vehicle`, `/api/checks/override`, `/api/audit/write`, `/api/reports/export`, `/api/bg/trigger`, `/api/bg/webhook`
- **§9** Guard screen flows — step-by-step contract for each of the four guard actions
- **§10** Dealer page — must work on 2G under 3s, under 50 KB total, no heavy libraries
- **§11** WH Manager dashboard contract
- **§12** CSO dashboard contract (includes the exact compliance clock layout)
- **§13** Build order — 33 sequential steps; don't skip
- **§14** Critical rules — 15 non-negotiable constraints, read in full before any backend work

**Critical rules that recur most often in decisions:**
1. PIN is server-generated, never returned to frontend, only sent via SMS
2. `QR_SECRET` is server-only
3. `fg_audit_events` is append-only
4. `fg_gate_events` is immutable after creation
5. Compliance checks are always server-side — never trust the client
6. Every manager override writes to audit with reason + user ID
7. Dealer page under 50 KB
8. Firebase Admin SDK only in `/api` routes
9. No `any` types
10. Components never import firebase directly — only from `/services`
11. All collections use `fg_` prefix
12. `/lib/firebase.ts` imported only by `/services` files
13. Driver has no `contractorId` — association recorded per gate event only
14. Driver background is a separate collection — never merged into `fg_drivers`
15. `TRIP_SOURCE` flag controls trip data source — change `.env` only
