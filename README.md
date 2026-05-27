# FleetGuard
 
Warehouse gate-management platform built on **Next.js 16 (App Router)** + **Supabase (PostgreSQL)** + **JWT cookie auth**. Manages driver compliance, vehicle checks, service providers, trips, visitors, incidents, and audit trails across multi-warehouse organisations.
 
---              

  

 
  
## Table of Contents
 
1. [Tech Stack](#tech-stack)
2. [Architecture](#architecture)
3. [Roles & Portals](#roles--portals)
4. [Prerequisites](#prerequisites)
5. [Environment Variables](#environment-variables)
6. [First-Time Setup](#first-time-setup)
7. [Running Locally](#running-locally)
8. [Available Scripts](#available-scripts)
9. [API Routes](#api-routes)
10. [Database Schema](#database-schema)
11. [Auth & MFA](#auth--mfa)
12. [Deployment (Vercel)](#deployment-vercel)

---  

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.3 — App Router, Turbopack |
| Language | TypeScript 5 (strict mode) |
| Database | Supabase (PostgreSQL 17) via `postgres` driver |
| Auth | JWT cookies (`fg_access` + `fg_refresh`) — `jose` |
| Styling | Tailwind CSS v4 (`@theme` CSS variables, no `tailwind.config.js`) |
| Validation | Zod |
| Password | bcryptjs (12 rounds) |
| MFA | TOTP via `otplib` |
| QR tokens | `qrcode` + `jose` signed JWTs |
| Excel export | `exceljs` |
| Email | `nodemailer` |
| SMS | MSG91 (`app/_lib/sms.ts`) |
| Blob storage | Vercel Blob |

--- 


## Architecture

Three strict layers — imports only flow downward:

```
Pages / Components  (app/<role>/**)
        │  imports _components, _contexts, _hooks, _services
        ▼
Services            (app/_services/*)
        │  calls /api/v2/* HTTP endpoints — NO direct DB access
        ▼
API Routes          (app/api/**/route.ts)
        │  direct Supabase SQL via postgres driver
        ▼
Supabase (PostgreSQL)
```

- Pages and services are **client-side** — they call v2 REST endpoints.
- All privileged operations (auth, DB writes, secrets) run **server-side** in API routes.
- A preflight gate (`scripts/preflight.ts`) runs before `dev` and `build` to enforce safety rules (S1–S8 — see `IMPLEMENTATION_PLAN.md`).

---

## Roles & Portals

| Role | Portal | Description |
|---|---|---|
| `superadmin` | `/superadmin` | Platform-wide — manages all orgs, users, warehouses |
| `company_admin` | `/company` | Org-scoped — manages users, warehouses, service providers |
| `wh_manager` | `/manager` | Single warehouse — drivers, vehicles, gate events, reports |
| `regional_manager` | `/manager` | Multi-warehouse — same as above across multiple sites |
| `guard` | `/guard` | Gate entry/exit operations |
| `cso` | `/cso` | Central security ops — alerts, incidents, compliance |

Login flow: `/login` → JWT issued → `/auth/redirect` → role-based redirect → `RoleGuard` on each portal layout.

---

## Image Storage

All images (driver face photos, DL scans, gate captures) are stored in **Vercel Blob** — a globally-distributed CDN-backed object store built for Next.js/Vercel apps.

### How it works

```
Guard camera / DL scan
        │
        ▼
POST /api/photo-upload          ← multipart file  (max 5 MB, JPEG/PNG/WebP)
POST /api/photo-upload/from-url ← rehost remote or base64 URL (IDfy DL photos)
        │
        ▼  app/api/dl-ocr/imageUploadService.ts
   @vercel/blob  put()
        │
        ▼
Vercel Blob CDN  (public, permanent URL)
        │
        ▼
URL stored in Supabase
  drivers.face_photo_url
  gate_events.photo_url
  visitor_entries.photo_url
  gate_sessions.photo_url
```

### Folders (path prefixes inside the blob store)

| Folder | Used for |
|---|---|
| `fg_photos` | Gate event captures, guard camera shots |
| `fg_dl_photos` | DL scan source images (rehosted from IDfy) |
| `fg_dl_images` | OCR source images |

### Constraints

- Max file size: **5 MB**
- Allowed types: `image/jpeg`, `image/png`, `image/webp`
- All blobs are **publicly readable** (no auth token needed to display)
- Blob URLs are **permanent** — they do not expire

### Required env var

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Get this from: **Vercel Dashboard → Storage → Blob → your store → `.env.local` snippet**

> For local dev you can use the same production token — Vercel Blob has no local emulator. Uploads from `localhost` work fine.

---

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- A **Supabase** project (free tier works for development)
- A **Vercel Blob** store (free tier: 1 GB — create in Vercel Dashboard → Storage)

---

## Environment Variables

Create `.env.local` in the project root:

```bash
# ── Supabase ──────────────────────────────────────────────────────────────────
# Transaction pooler URL (port 6543) from Supabase → Project Settings → Database
SUPABASE_POOLER_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# ── JWT signing ───────────────────────────────────────────────────────────────
# 64-char random hex — generate with: openssl rand -hex 32
JWT_SECRET=your_64_char_hex_secret_here

# ── QR tokens ────────────────────────────────────────────────────────────────
QR_SECRET=your_qr_secret_here

# ── Vercel Blob (image storage) ───────────────────────────────────────────────
# From Vercel Dashboard → Storage → Blob → your store → .env.local snippet
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# ── Trip source ───────────────────────────────────────────────────────────────
# "mock" for local dev (no real trip data required), "firestore" or "superprocure" for production
TRIP_SOURCE=mock

# ── Optional: SMS (MSG91) ─────────────────────────────────────────────────────
MSG91_AUTH_KEY=your_msg91_key

# ── Optional: bootstrap credentials override ──────────────────────────────────
SEED_SUPERADMIN_EMAIL=admin@fleetguard.dev
SEED_SUPERADMIN_PASSWORD=FleetGuard@2024!
```

> **Never commit `.env.local`** — it is in `.gitignore`.

---

## First-Time Setup

Run these steps once after cloning:

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the variables above into `.env.local` with your Supabase project details.

### 3. Run database migrations

Creates all tables, indexes, enums, and partitions in Supabase:

```bash
npm run db:migrate
```

### 4. Bootstrap superadmin

Creates the platform org and superadmin user. MFA is **OFF** by default — enable per-user from the superadmin portal when required:

```bash
npm run bootstrap
```

Output:

```
✅  Platform org created
✅  Superadmin user created

════════════════════════════════════════════
  Superadmin Credentials
  ─────────────────────────────────────────
  Email    : admin@fleetguard.dev
  Password : FleetGuard@2024!
  Role     : superadmin
  MFA      : OFF  (enable per-user from /superadmin)
  URL      : http://localhost:3000/login  →  /superadmin
════════════════════════════════════════════
```

The script is **idempotent** — re-running it refreshes the password and ensures MFA stays OFF. Override credentials via `SEED_SUPERADMIN_EMAIL` and `SEED_SUPERADMIN_PASSWORD` in `.env.local`.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login) and sign in with the superadmin credentials above.

---

## Running Locally

```bash
npm run dev          # starts Next.js with Turbopack on :3000
```

The `predev` hook runs `scripts/preflight.ts` automatically. It checks:

- `TRIP_SOURCE` is set
- No bare non-`fg_*` Firestore collection literals remain (legacy safety rule)
- Admin SDK import boundary is clean

To skip preflight in an emergency: `SKIP_PREFLIGHT=1 npx next dev`

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (runs preflight first) |
| `npm run build` | Production build (runs preflight first) |
| `npm run start` | Start production server |
| `npm run bootstrap` | Create platform org + superadmin user in Supabase |
| `npm run db:migrate` | Run all pending SQL migrations in `db/migrations/` |
| `npm run lint` | ESLint (enforces S1 + S8 safety rules) |
| `npm run format` | Prettier write on `app/**` and `scripts/**` |
| `npm run format:check` | Prettier check (no writes) |
| `npm run preflight` | Run safety checks manually |
| `npm run seed:fg` | Seed demo data (drivers, vehicles, gate events) |

---

## API Routes

All data endpoints are under `/api/v2/*`. Auth endpoints are under `/api/auth/v2/*`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/v2/login` | Email + password login — issues `fg_access` + `fg_refresh` cookies |
| `POST` | `/api/auth/v2/logout` | Clears session cookies |
| `POST` | `/api/auth/v2/mfa` | Complete MFA challenge (TOTP code) |
| `GET` | `/api/v2/me` | Returns full profile for the authenticated user |

### Core Resources

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v2/orgs` | List organisations |
| `POST` | `/api/v2/orgs` | Create organisation |
| `GET/PATCH` | `/api/v2/orgs/[id]` | Get / update org |
| `GET` | `/api/v2/warehouses` | List warehouses (scoped to org) |
| `POST` | `/api/v2/warehouses` | Create warehouse |
| `GET/PATCH` | `/api/v2/warehouses/[id]` | Get / update warehouse |
| `GET` | `/api/v2/gates` | List gates (by warehouse or org) |
| `POST` | `/api/v2/gates` | Create gate |
| `PATCH` | `/api/v2/gates/[id]` | Update gate |
| `GET` | `/api/v2/users` | List users (scoped to org) |
| `POST` | `/api/v2/users` | Create user |
| `GET/PATCH` | `/api/v2/users/[id]` | Get / update user |
| `GET` | `/api/v2/drivers` | List drivers |
| `GET` | `/api/v2/vehicles` | List vehicles |
| `PATCH` | `/api/v2/vehicles/[id]` | Update vehicle |
| `GET` | `/api/v2/contractors` | List service providers / contractors |
| `POST` | `/api/v2/contractors` | Create contractor |
| `GET` | `/api/v2/dealers` | List dealers |
| `POST` | `/api/v2/dealers` | Create dealer |

### Operations

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/v2/gate-events` | List / create gate events |
| `PATCH` | `/api/v2/gate-events/[id]` | Update gate event (e.g. mark exited) |
| `GET` | `/api/v2/gate-sessions` | List active gate sessions |
| `GET/POST` | `/api/v2/visitors` | List / create visitor entries |
| `PATCH` | `/api/v2/visitors/[id]` | Update visitor (exit time, status) |
| `GET/POST` | `/api/v2/inbound-entries` | List / create inbound entries |
| `PATCH` | `/api/v2/inbound-entries/[id]` | Complete / reject inbound entry |
| `GET` | `/api/v2/trips` | List trips |
| `GET/PATCH` | `/api/v2/trips/[id]` | Get trip detail / update status or stop |
| `GET` | `/api/v2/alerts` | List alerts (by warehouse, status) |
| `POST` | `/api/v2/alerts` | Create alert |
| `PATCH` | `/api/v2/alerts/[id]` | Acknowledge / resolve alert |
| `GET/POST` | `/api/v2/incidents` | List / create incidents |
| `PATCH` | `/api/v2/incidents/[id]` | Update incident status |
| `GET` | `/api/v2/audit` | Paginated audit log (by warehouse + offset) |
| `GET` | `/api/v2/compliance` | Compliance bucket counts by warehouse |
| `GET/POST` | `/api/v2/support-tickets` | List / create support tickets |
| `PATCH` | `/api/v2/support-tickets/[id]` | Update ticket status |

---

## Database Schema

Migrations live in `db/migrations/`. Run with `npm run db:migrate`.

### Key Tables

| Table | Description |
|---|---|
| `orgs` | Organisations / companies |
| `users` | All users (all roles). `mfa_required` flag controls MFA enforcement per user |
| `warehouses` | Physical warehouse sites |
| `gates` | Entry/exit points within a warehouse |
| `contractors` | Service providers (transport, fuel, security, etc.) |
| `drivers` | Registered drivers with DL details and background check status |
| `vehicles` | Fleet vehicles with RC, insurance, fitness, PUC expiry dates |
| `gate_events` | Every vehicle/person entry and exit event (partitioned by year) |
| `gate_sessions` | Open sessions (vehicle currently inside) |
| `trips` | Delivery trips with stops |
| `trip_stops` | Individual delivery stops per trip |
| `inbound_entries` | Inbound goods receiving records |
| `visitor_entries` | Visitor passes |
| `alerts` | Real-time compliance and operational alerts |
| `incidents` | Security / compliance incidents with escalation |
| `audit_events` | Append-only audit trail (partitioned by year) |
| `sessions` | JWT refresh token sessions |
| `mfa_credentials` | TOTP secrets per user |

### Roles Enum

```sql
CREATE TYPE user_role AS ENUM (
  'superadmin', 'company_admin', 'guard',
  'wh_manager', 'regional_manager', 'cso'
);
```

---

## Auth & MFA

### How login works

1. `POST /api/auth/v2/login` with `{ email, password }`
2. If the user has `mfa_required = true`, the response returns `{ mfaRequired: true, preAuthToken }` — no cookies yet. The client redirects to `/login/mfa`.
3. On a successful full login (no MFA, or after MFA is verified), two `HttpOnly` cookies are set:
   - `fg_access` — short-lived JWT (15 min)
   - `fg_refresh` — long-lived JWT (7 days), used to silently renew access

### MFA

MFA is **OFF by default** for all users including superadmin.

To enable MFA for a specific user:
1. Log in as superadmin → `/superadmin` → open the user → toggle **MFA required**
2. The user will be prompted to enrol TOTP on their next login

To disable MFA for a user (e.g. lost authenticator): update `mfa_required = false` via the superadmin portal or re-run `npm run bootstrap` to reset the superadmin specifically.

---


## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Set all environment variables from the [Environment Variables](#environment-variables) section in the Vercel project settings.
3. Vercel auto-runs `npm run build` — the preflight gate runs automatically as part of `prebuild`.
4. After first deployment, run `npm run bootstrap` locally (pointing at the production `SUPABASE_POOLER_URL`) to create the superadmin.

> `TRIP_SOURCE` should be `mock` for staging and `firestore` or `superprocure` for production depending on your trip data source.   
