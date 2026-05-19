import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { createBridgedAlert } from "@/app/_server/alerts/createBridged";

const DL_WARNING_DAYS = Number(process.env.DL_WARNING_DAYS ?? 30);
const BG_BLOCKED_STATUSES = ["flagged"];

const DriverCheckSchema = z.object({
  driverId: z.string(),
  warehouseId: z.string().optional(),
});

// POST /api/v2/checks/driver — run compliance check on a driver
// Computes DL status, records a compliance_checks row, fires alerts if blocked.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = DriverCheckSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { driverId, warehouseId } = parsed.data;

  const [driver] = await db`
    SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status
    FROM   drivers
    WHERE  id = ${driverId} AND org_id = ${actor.org}
    LIMIT  1
  `;

  if (!driver) {
    return applySecurityHeaders(NextResponse.json({ error: "Driver not found" }, { status: 404 }));
  }

  const now = new Date();
  const expiry = new Date(driver.dl_expiry as string);
  const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / 86400000);

  const dlStatus: string =
    daysUntilExpiry < 0 ? "expired" :
    daysUntilExpiry <= DL_WARNING_DAYS ? "expiring" :
    "clear";

  const bgBlocked = BG_BLOCKED_STATUSES.includes(driver.bg_status as string);
  const blocked = dlStatus === "expired" || bgBlocked;

  // Persist updated DL status on driver
  if (dlStatus !== driver.dl_status) {
    await db`UPDATE drivers SET dl_status = ${dlStatus}, updated_at = now() WHERE id = ${driverId}`;
  }

  // Record compliance check
  const checkId = uuidv7();
  await db`
    INSERT INTO compliance_checks (
      id, org_id, entity_type, entity_id, check_type, status, expiry_date, checked_by
    ) VALUES (
      ${checkId}, ${actor.org}, 'driver', ${driverId}, 'dl', ${dlStatus},
      ${driver.dl_expiry as string}, ${actor.sub}
    )
  `;

  // DL expired / expiring no longer raise alerts — they're operational
  // nudges that flooded the inbox. BG-flagged still escalates to an
  // incident via the bridged-alert helper.
  const alertIds: string[] = [];
  if (bgBlocked && warehouseId) {
    const r = await createBridgedAlert({
      orgId:       actor.org ?? "",
      warehouseId,
      type:        "bg_flagged",
      severity:    "critical",
      message:     `Background check flagged for ${driver.full_name as string}`,
      entityType:  "driver",
      entityId:    driverId,
      raisedBy:    actor.sub,
      actorRole:   actor.role,
    });
    if (!r.skipped && r.alertId) alertIds.push(r.alertId);
  }

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "check.driver",
    resourceType: "driver",
    resourceId: driverId,
    warehouseId,
    payload: { dlStatus, bgStatus: driver.bg_status, blocked, daysUntilExpiry },
  });

  return applySecurityHeaders(
    NextResponse.json({ dlStatus, bgStatus: driver.bg_status, blocked, checkId, alertIds }),
  );
}
