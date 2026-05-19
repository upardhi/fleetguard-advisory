# FleetGuard — Security Controls Inventory

Aligned to **SOC 2 Trust Service Criteria** (CC series) and **ISO 27001:2022 Annex A**.
Last updated: 2026-04-29.

---

## CC6 — Logical and Physical Access Controls

| Control | Implementation | Location |
|---|---|---|
| CC6.1 — Authentication | Stateless JWT (HS256) in HttpOnly + Secure + SameSite=Lax cookie. 15-min access token, 7-day refresh token. | `app/_server/auth/jwt.ts` |
| CC6.1 — Password policy | Minimum 12 chars, upper + lower + digit + special required. Last 12 hashes checked on reset. bcrypt cost=12. | `app/_server/auth/password.ts` |
| CC6.1 — MFA | TOTP (RFC 6238, 6-digit, 30-second window) required for `company_admin`, `cso`, `regional_manager`. Credential stored AES-256-GCM encrypted. | `app/_server/auth/mfa.ts` |
| CC6.1 — Brute-force protection | Per-IP (20/min) and per-email (5/5min) rate limits enforced via atomic DB counters before password comparison. Constant-time bcrypt path for unknown emails. | `app/_server/security/rateLimit.ts`, `app/api/auth/v2/login/route.ts` |
| CC6.2 — Session management | Sessions stored in Postgres; validated on every request. Explicit revocation on logout and password change. Hourly cron purges expired/revoked rows. | `app/_server/auth/sessions.ts` |
| CC6.3 — Role-based access | `user_role` enum enforced at DB level; `RoleGuard` component on portal layouts; middleware redirects unauthenticated. | `app/_server/auth/getUser.ts`, `middleware.ts` |
| CC6.6 — Transmission security | HSTS header (1 year, preload) on all responses. TLS 1.2+ enforced by Vercel edge and Supabase. | `app/_server/security/headers.ts` |
| CC6.7 — Encryption at rest | PII columns (mobile, DL number, subject_email) encrypted with AES-256-GCM. Per-org subkeys derived via HMAC-SHA256 HKDF from a master key. | `app/_server/db/encryption.ts` |

---

## CC7 — System Operations

| Control | Implementation |
|---|---|
| CC7.2 — Audit logging | Every state-changing API call writes to `audit_events` (append-only, partitioned). SHA-256 hash chain detects tampering: each event includes `prev_hash` of the previous event for the same org. |
| CC7.3 — Incident management | `incidents` table with SLA deadlines + escalation policies. Cron escalates overdue incidents every 5 minutes. |
| CC7.4 — Security monitoring | `login_attempts` table provides brute-force signal. Rate limit counters expose denial-of-service signal. |

---

## CC8 — Change Management

| Control | Implementation |
|---|---|
| CC8.1 — DB schema changes | Plain SQL migrations in `db/migrations/` applied in order by `npm run db:migrate`. Applied filenames recorded in `_migrations` table; re-runs are idempotent. Never mutate existing `fg_*` collections in place (rule S10). |

---

## CC9 — Risk Mitigation

| Control | Implementation |
|---|---|
| CC9.2 — Idempotency | POST endpoints accept `Idempotency-Key` header; responses cached 24 hours to prevent duplicate processing. | `app/_server/security/idempotency.ts` |
| CC9.2 — Input validation | All API inputs validated with Zod schemas before processing. |

---

## A.18 — Compliance (ISO 27001)

| Control | Implementation |
|---|---|
| A.18.1.4 — Privacy (DPDP 2023 / GDPR) | `subject_requests` table tracks access, erasure, portability, and rectification requests with 30-day SLA enforcement. |
| A.18.1.3 — Data retention | Partitioned `gate_events` and `audit_events` tables allow partition-level DROP for retention enforcement without table scans. |

---

## Deferred controls (post-v1)

- Penetration test (third-party, annual)
- SOC 2 Type II audit engagement
- Vulnerability disclosure programme / bug bounty
- SIEM integration for audit event streaming
- Hardware security module (HSM) for encryption master key
