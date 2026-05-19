---
name: FleetGuard project state
description: Current state of the FleetGuard POC — Next.js 16 gate security platform, 27+ routes, Firebase auth hierarchy being wired
type: project
originSessionId: c5b2b0e4-cc0b-4bfb-9858-bdb3dfdef04f
---
# FleetGuard — Gate Intelligence Platform

**What:** Enterprise gate & fleet security POC for a client with 37 warehouses and 70+ 3PL vehicles. Enforces compliance at every gate entry, face-verifies driver movements, runs digital delivery confirmation via signed QR + SMS PIN, and gives security leadership pan-India command visibility.

**Why:** POC for a client currently using paper-based gate logs. They run an SAP instance and use SuperProcure for trip planning (integration later). Drivers belong to multiple contractors with no permanent link — contractor association is recorded per gate event only.

**How to apply:** When asked about screens, data shape, or flows — consult `Requirementdoc.md` at project root first; every decision there is intentional. Do not propose restructuring the data model or the `fg_*` naming.

## Stack (current working project — NOT what the brief text says)
- **Next.js 16.2.3** (App Router, Turbopack) — brief says 14, actual is 16, follow 16 conventions (`params: Promise<…>`, inline SVG paths, etc.)
- React 19.2
- TypeScript strict mode
- Tailwind v4 with `@theme` tokens (NOT v3 — no `tailwind.config.js`)
- lucide-react icons, clsx
- Firebase (client + admin SDK) — auth hierarchy now being wired

## User hierarchy (as of 2026-04-15)
```
SuperAdmin (hardcoded, created via npm run create:superadmin)
  └─ Company Admin (created by SuperAdmin inside /superadmin/companies/[orgId]/users)
       └─ Company Users: Guard, CSO, Warehouse Manager, Regional Manager
             (created by Company Admin inside /company/users)
```
- **SuperAdmin** → `/superadmin` — manages all companies (fg_organisations), company admins, warehouses, dealers, service providers
- **Company Admin** → `/company` — manages own org's users (all roles except company_admin), warehouses, dealers, service providers, gates
- **Guard** → `/guard` — gate operations
- **Warehouse Manager / Regional Manager** → `/manager` — fleet/trip/driver oversight
- **CSO** → `/cso` — pan-company visibility

## Auth flow (as of 2026-04-15)
- Login at `/login` → Firebase Auth sign-in → role read from `fg_users` via `useAuth`
- `/auth/redirect` page reads role from `fgUser` and routes to correct home
- `RoleGuard` component on each layout blocks wrong-role access
- User creation: POST `/api/users/create` uses Admin SDK to create Firebase Auth account + `fg_users` doc atomically
- Bootstrap scripts: `npm run create:superadmin`, `npm run create:companyadmin`

## Current state (as of 2026-04-15)
- **27+ routes built end-to-end** with mock data — design system, sidebars, topbars, tables, status semantics, live-dot animations, all production-quality UI
- **SuperAdmin + Company Admin portals** fully built (organisations, users, warehouses, dealers, service providers, gates)
- **Auth hierarchy wired**: login → role redirect → role-guarded layouts → downstream role pages
- Build is clean (`npx next build`), TypeScript strict passes, Turbopack prerenders in <1s
- Downstream role pages (guard, manager, cso) still on mock data — Firebase wiring is next phase
- Implementation plan for the migration lives at `IMPLEMENTATION_PLAN.md` (project root)

## Project layout (do not reshape)
- `/app` (NOT `/src/app`) — root-level app directory. Brief says `/src/app` but actual project is flat `/app/`; keep it.
- `/app/_components` — shared UI kit (Sidebar, TopBar, StatCard, Badge, Card, CheckBadge, LiveIndicator, StatusPill, PageHeader, Button, Avatar, Logo, SlidePanel, CompanyTabs)
- `/app/_lib/types.ts` — domain types, mirrors brief §4
- `/app/_lib/mockData.ts` — current demo data (15 warehouses, 8 drivers, 12 vehicles, 8 contractors, 4 trips, 11 incidents, 15 audit events, 10 visitors, 8 alerts)
- `/app/_lib/utils.ts` — cx, fmt helpers, initials, avatarHue
- `/app/guard`, `/app/manager`, `/app/cso` — role modules each with their own `layout.tsx` + `Sidebar`
- `/app/superadmin` — super admin portal (companies, users, warehouses, dealers, service providers)
- `/app/company` — company admin portal (users, warehouses, dealers, service providers, gates)
- `/app/auth/redirect` — post-login role redirect page
- `/app/deliver/[token]/page.tsx` — public dealer page (under 50 KB target)
- `/app/login/page.tsx` — split-screen SSO entry
- `/app/api/users/create/route.ts` — Admin SDK user creation endpoint

## Routes shipped
- Public: `/`, `/login`, `/deliver/[token]`, `/auth/redirect`
- SuperAdmin (8): `/superadmin`, `/superadmin/companies`, `/superadmin/companies/[orgId]`, `/superadmin/companies/[orgId]/users`, `/superadmin/companies/[orgId]/warehouses`, `/superadmin/companies/[orgId]/warehouses/[warehouseId]/gates`, `/superadmin/companies/[orgId]/dealers`, `/superadmin/companies/[orgId]/service-providers`, `/superadmin/account`
- Company Admin (7): `/company`, `/company/users`, `/company/warehouses`, `/company/warehouses/[warehouseId]/gates`, `/company/dealers`, `/company/service-providers`, `/company/account`
- Guard (8): `/guard`, `/guard/active-events`, `/guard/truck-entry`, `/guard/visitor-entry`, `/guard/confirm-departure`, `/guard/trip-return`, `/guard/close-trip`
- Manager (8): `/manager`, `/manager/trips`, `/manager/drivers`, `/manager/vehicles`, `/manager/visitors`, `/manager/contractors`, `/manager/alerts`, `/manager/incidents`
- CSO (7): `/cso`, `/cso/warehouses`, `/cso/live-map`, `/cso/alerts`, `/cso/incidents`, `/cso/compliance`, `/cso/audit`

## Design conventions (keep consistent)
- Brand palette: deep navy `#0f2347` + amber accent `#f59e0b` + semantic success/warning/danger
- Sidebar uses a **string-keyed icon registry** (not component references) so it's safe to pass through the server→client boundary
- Lists are tables (not card grids) everywhere except: warehouse live-map, warehouse grid on CSO home, and dealer pages. User explicitly asked for tables over cards on 2026-04-15
- Numerics use the `.num` class (`font-variant-numeric: tabular-nums`)
- Status chips use the semantic `Badge` tones; status pill components are in `_components/StatusPill.tsx`
- Compliance clock is a 3×3 matrix (DL / Vehicle / Contractor × 0-30 / 31-60 / 61-90)

## Dependencies added beyond create-next-app
- `lucide-react` — icons
- `clsx` — class concatenation
- `bcryptjs` — password hashing (available if needed)
- `jose` — JWT signing (available if needed)
- `zod` — schema validation
