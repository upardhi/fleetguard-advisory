/**
 * GET / POST /api/cron/incidents/escalate
 *
 * Triggered by Supabase pg_cron every 15 minutes. Walks every open or
 * investigating incident, decides if any L1/L2/L3 transition is due based on
 * % of SLA elapsed, and (atomically per incident) bumps `escalation_level`,
 * writes an alert row, and sends emails to the right recipients.
 *
 * Auth: header `Authorization: Bearer ${CRON_SECRET}`. Anything else → 401.
 *
 * Idempotency: each incident's `escalation_level` only ever moves forward.
 * The level guard in the WHERE clause means re-running the cron in the same
 * window is a no-op.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { sendMail } from "@/app/_lib/sendMail";
import {
  buildIncidentCtx,
  emailIncidentReminder,
  emailIncidentEscalatedRm,
  emailIncidentEscalatedCso,
} from "@/app/_lib/incidentEmails";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { loadOrgSlaConfig, isPausedToday } from "@/app/_lib/incidentSla";

interface IncidentRow {
  id:                string;
  org_id:            string;
  warehouse_id:      string | null;
  type:              string;
  severity:          string;
  description:       string;
  assigned_to:       string | null;
  raised_by:         string;
  created_at:        string;
  sla_start_at:      string | null;
  sla_deadline:      string;
  escalation_level:  number;
}

/**
 * Returns the elapsed fraction of SLA. Uses sla_start_at when present so
 * non-critical incidents raised overnight don't accumulate elapsed time
 * before the business-hours window opens. Falls back to created_at for
 * legacy rows that pre-date migration 0010.
 */
function elapsedPct(slaStartAt: string | null, createdAt: string, slaDeadline: string): number {
  const start = new Date(slaStartAt ?? createdAt).getTime();
  const end   = new Date(slaDeadline).getTime();
  const span  = end - start;
  if (span <= 0) return 1;
  return (Date.now() - start) / span;
}

interface Recipient { id: string; full_name: string; email: string | null }

async function fetchRecipients(ids: string[]): Promise<Recipient[]> {
  if (ids.length === 0) return [];
  const rows = await db`
    SELECT id, full_name, email FROM users WHERE id = ANY(${ids}) AND is_active = true
  `;
  return rows.map((r) => ({
    id:        r.id as string,
    full_name: (r.full_name as string) ?? "",
    email:     (r.email as string | null) ?? null,
  }));
}

async function regionalManagersFor(orgId: string, warehouseId: string | null): Promise<Recipient[]> {
  if (!warehouseId) return [];
  const rows = await db`
    SELECT id, full_name, email FROM users
    WHERE  org_id = ${orgId} AND role = 'regional_manager' AND is_active = true
      AND  ${warehouseId} = ANY(warehouse_ids)
  `;
  return rows.map((r) => ({
    id:        r.id as string,
    full_name: (r.full_name as string) ?? "",
    email:     (r.email as string | null) ?? null,
  }));
}

async function csosFor(orgId: string): Promise<Recipient[]> {
  const rows = await db`
    SELECT id, full_name, email FROM users
    WHERE  org_id = ${orgId} AND role = 'cso' AND is_active = true
  `;
  return rows.map((r) => ({
    id:        r.id as string,
    full_name: (r.full_name as string) ?? "",
    email:     (r.email as string | null) ?? null,
  }));
}

async function processOne(inc: IncidentRow): Promise<{ id: string; level: number; emailed: number } | null> {
  const elapsed = elapsedPct(inc.sla_start_at, inc.created_at, inc.sla_deadline);
  let nextLevel = inc.escalation_level;

  if (inc.escalation_level === 0 && elapsed >= 0.5) nextLevel = 1;
  else if (inc.escalation_level === 1 && elapsed >= 1.0) nextLevel = 2;
  else if (inc.escalation_level === 2 && elapsed >= 1.5) nextLevel = 3;

  if (nextLevel === inc.escalation_level) return null;

  // Atomically bump only if the level still matches what we read. If two cron
  // runs overlap, the second one's UPDATE returns 0 rows and we skip.
  const bumped = await db`
    UPDATE incidents
    SET    escalation_level = ${nextLevel}, updated_at = now()
    WHERE  id = ${inc.id} AND escalation_level = ${inc.escalation_level}
    RETURNING id
  `;
  if (bumped.length === 0) return null;

  // Resolve metadata for emails / alerts.
  const [wh] = inc.warehouse_id
    ? await db`SELECT name FROM warehouses WHERE id = ${inc.warehouse_id} LIMIT 1`
    : [{ name: null }];
  const [org] = await db`SELECT name FROM orgs WHERE id = ${inc.org_id} LIMIT 1`;
  const warehouseName = (wh?.name as string) ?? "—";
  const orgName       = (org?.name as string) ?? "—";

  const slaMinutes = Math.max(
    1,
    Math.round((new Date(inc.sla_deadline).getTime() - new Date(inc.created_at).getTime()) / 60000),
  );
  const minutesOverdue = Math.max(0, Math.round((Date.now() - new Date(inc.sla_deadline).getTime()) / 60000));
  const minutesRemaining = Math.max(0, -minutesOverdue);
  const minutesToL3 = Math.max(0, Math.round(slaMinutes * 0.5));

  const ctx = buildIncidentCtx({
    id:            inc.id,
    type:          inc.type,
    severity:      inc.severity,
    description:   inc.description,
    warehouseName,
    raisedByName:  "—",
    raisedAt:      new Date(inc.created_at),
    slaDeadline:   new Date(inc.sla_deadline),
    slaMinutes,
  });

  // Recipients only — escalations no longer raise a fresh alert row. The
  // alert linked to the incident is the single source of truth in the UI;
  // the timeline below + emails below carry the level transition.
  let recipients: Recipient[] = [];
  if (nextLevel === 1) {
    recipients = inc.assigned_to ? await fetchRecipients([inc.assigned_to]) : [];
  } else if (nextLevel === 2) {
    recipients = await regionalManagersFor(inc.org_id, inc.warehouse_id);
  } else {
    recipients = await csosFor(inc.org_id);
  }

  // ── Audit timeline ────────────────────────────────────────────────────────
  await db`
    INSERT INTO incident_events (id, incident_id, org_id, event_type, actor_id, actor_name, payload)
    VALUES (
      ${uuidv7()}, ${inc.id}, ${inc.org_id}, 'escalated', NULL, 'FleetGuard (automated)',
      ${db.json({
        level: nextLevel,
        elapsedPct: Number(elapsed.toFixed(2)),
        recipientIds: recipients.map((r) => r.id),
      } as Parameters<typeof db.json>[0])}
    )
  `;

  // ── Emails (best-effort, fire-and-forget so a slow SMTP doesn't slow the cron) ──
  let emailed = 0;
  for (const r of recipients) {
    if (!r.email) continue;
    let template: { subject: string; html: string };
    if (nextLevel === 1) {
      template = emailIncidentReminder(ctx, { name: r.full_name }, minutesRemaining || Math.round(slaMinutes / 2));
    } else if (nextLevel === 2) {
      const fromName = inc.assigned_to
        ? ((await fetchRecipients([inc.assigned_to]))[0]?.full_name ?? "Manager")
        : "Manager";
      template = emailIncidentEscalatedRm(ctx, { name: r.full_name }, fromName, minutesOverdue, minutesToL3);
    } else {
      const lastAssignedName = inc.assigned_to
        ? ((await fetchRecipients([inc.assigned_to]))[0]?.full_name ?? "Regional Manager")
        : "Regional Manager";
      template = emailIncidentEscalatedCso(ctx, { name: r.full_name }, lastAssignedName, minutesOverdue, orgName);
    }
    void sendMail({ to: r.email, subject: template.subject, html: template.html });
    emailed += 1;
  }

  return { id: inc.id, level: nextLevel, emailed };
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return applySecurityHeaders(NextResponse.json(
      { error: "CRON_SECRET not configured on the server" },
      { status: 503 },
    ));
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const incidents = await db<IncidentRow[]>`
    SELECT id, org_id, warehouse_id, type, severity, description, assigned_to,
           raised_by, created_at, sla_start_at, sla_deadline, escalation_level
    FROM   incidents
    WHERE  status IN ('open', 'investigating')
      AND  escalation_level < 3
  `;

  // Cache one SLA-config lookup per org for the duration of this run.
  // Lets us cheaply skip incidents whose org has today configured as a
  // paused weekday (Sunday by default; CSO can configure other days).
  const orgPausedCache = new Map<string, boolean>();
  async function isOrgPausedToday(orgId: string): Promise<boolean> {
    const hit = orgPausedCache.get(orgId);
    if (hit !== undefined) return hit;
    const cfg = await loadOrgSlaConfig(orgId);
    const paused = isPausedToday(cfg.pausedDays);
    orgPausedCache.set(orgId, paused);
    return paused;
  }

  const results: Array<{ id: string; level: number; emailed: number }> = [];
  let l1 = 0, l2 = 0, l3 = 0;
  let pausedSkipped = 0;
  for (const inc of incidents) {
    try {
      if (await isOrgPausedToday(inc.org_id)) {
        pausedSkipped += 1;
        continue;
      }
      const r = await processOne(inc);
      if (!r) continue;
      results.push(r);
      if (r.level === 1) l1 += 1;
      else if (r.level === 2) l2 += 1;
      else if (r.level === 3) l3 += 1;
    } catch (err) {
      console.error("[cron/escalate] error processing", inc.id, err);
    }
  }

  return applySecurityHeaders(NextResponse.json({
    ok: true,
    processed: results.length,
    scanned:   incidents.length,
    pausedSkipped,
    l1, l2, l3,
    at:        new Date().toISOString(),
  }));
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
