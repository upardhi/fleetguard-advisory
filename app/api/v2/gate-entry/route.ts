import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { createBridgedAlert } from "@/app/_server/alerts/createBridged";
import { maintenanceCheck } from "@/app/_server/maintenance/check";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dlStatusFromValidation(s: string): "clear" | "expiring" | "expired" | "blocked" {
  if (s === "valid") return "clear";
  if (s === "invalid_transport_expired" || s === "invalid_nt_expired") return "expired";
  if (s === "inconclusive") return "expiring";
  return "blocked";
}

function bgStatusFromCrime(step: string, total: number): "pending" | "clear" | "flagged" | "failed" {
  if (step === "done") return total === 0 ? "clear" : "flagged";
  if (step === "error") return "failed";
  return "pending";
}

// Parses "DD/MM/YYYY" → ISO date string "YYYY-MM-DD", falls back to far future.
function parseDlDateToIso(s: string | null | undefined): string {
  if (!s) return "2099-01-01";
  const [d, m, y] = s.split("/");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return isNaN(dt.getTime()) ? "2099-01-01" : dt.toISOString().slice(0, 10);
}

// ── Schema ────────────────────────────────────────────────────────────────────

const GateEntrySchema = z.object({
  idempotencyKey: z.string().max(200).nullable().optional(),
  warehouseId:    z.string().min(1),

  // Pre-resolved IDs from the verify step — skip SELECT-to-check when provided
  driverId:  z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),

  // Driver / DL
  dlNumber:           z.string().min(5).max(30),
  dlNumberDisplay:    z.string().max(30).nullable().optional(),
  driverName:         z.string().max(200).default("Unverified driver"),
  facePhotoUrl:       z.string().url().nullable().optional(),
  dlImageUrl:         z.string().url().nullable().optional(),

  // DL validation outcome
  dlValidationStatus:   z.string().default("invalid_no_record"),
  dlValidationLabel:    z.string().default(""),
  dlValidationBlocking: z.boolean().default(false),
  dlProvider:           z.string().default("none"),
  dlVerifyData: z.object({
    provider:    z.string(),
    capturedAt:  z.string(),
    data:        z.record(z.string(), z.unknown()),
  }).nullable().optional(),

  // DL normalized validity dates ("DD/MM/YYYY")
  dlTransportValidTo:      z.string().nullable().optional(),
  dlTransportValidFrom:    z.string().nullable().optional(),
  dlNonTransportValidTo:   z.string().nullable().optional(),
  dlNonTransportValidFrom: z.string().nullable().optional(),

  // Crime check outcome
  crimeStep:           z.enum(["initiating", "waiting", "polling", "done", "error"]).default("error"),
  crimeProvider:       z.string().nullable().optional(),
  crimeCaseId:         z.string().nullable().optional(),
  crimeTotal:          z.number().int().min(0).default(0),
  crimeActiveCriminal: z.number().int().min(0).default(0),
  crimeCheckedAt:      z.string().nullable().optional(),
  // Raw vendor payloads — persisted so cached-driver views can render cases
  // without re-polling. Both optional for backwards compatibility.
  crimeInitiateData:   z.record(z.string(), z.unknown()).nullable().optional(),
  crimePollData:       z.record(z.string(), z.unknown()).nullable().optional(),

  // Vehicle
  vehicleReg:      z.string().max(30).nullable().optional(),
  vehicleType:     z.string().max(50).nullable().optional(),
  rcExpiry:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fitnessExpiry:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  pucExpiry:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rcOwnerName:     z.string().nullable().optional(),
  rcManufacturer:  z.string().nullable().optional(),
  rcVehicleClass:  z.string().nullable().optional(),
  rcVerifyProvider:z.string().nullable().optional(),

  // Contractors
  contractorIds:  z.array(z.string()).default([]),
  contractorName: z.string().max(200).nullable().optional(),

  // Photos + override
  photoUrl:       z.string().url().nullable().optional(),
  overrideReason: z.string().max(1000).nullable().optional(),

  // Import helpers — not used by normal gate flows
  occurredAt:     z.string().nullable().optional(),  // ISO timestamp; overrides server `now` for historical imports
  suppressAlerts: z.boolean().default(false),        // skip alert/incident creation for batch imports
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["guard", "wh_manager", "regional_manager", "company_admin", "superadmin"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const maint = maintenanceCheck();
  if (maint) return maint;

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  // Diagnostic log — compare mobile vs web payloads, especially crime fields.
  // Remove once the intermittent crime-data drop is diagnosed.
  const ua = req.headers.get("user-agent") ?? "";
  const client = /okhttp|expo|reactnative|dl-scanner/i.test(ua) ? "mobile" : "web";
  const b = body as Record<string, unknown> | null;
  console.log("[gate-entry] incoming", JSON.stringify({
    client,
    userAgent:           ua,
    idempotencyKey:      b?.idempotencyKey ?? null,
    dlNumber:            b?.dlNumber ?? null,
    vehicleReg:          b?.vehicleReg ?? null,
    crimeStep:           b?.crimeStep ?? null,
    crimeProvider:       b?.crimeProvider ?? null,
    crimeCaseId:         b?.crimeCaseId ?? null,
    crimeTotal:          b?.crimeTotal ?? null,
    crimeActiveCriminal: b?.crimeActiveCriminal ?? null,
    crimeCheckedAt:      b?.crimeCheckedAt ?? null,
    hasCrimeInitiateData: b?.crimeInitiateData != null && Object.keys(b.crimeInitiateData as object).length > 0,
    hasCrimePollData:     b?.crimePollData != null && Object.keys(b.crimePollData as object).length > 0,
    crimePollCases:      Array.isArray((b?.crimePollData as Record<string, unknown> | null | undefined)?.caseDetails)
                            ? ((b!.crimePollData as { caseDetails: unknown[] }).caseDetails).length
                            : 0,
    fullBody: b,
  }));

  const parsed = GateEntrySchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[gate-entry] validation failed", JSON.stringify({ client, issues: parsed.error.issues }));
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  try {
  const d = parsed.data;
  const now = new Date();
  const eventOccurredAt = d.occurredAt ? new Date(d.occurredAt) : now;
  const dlNorm = d.dlNumber.toUpperCase().replace(/[\s\-]/g, "");
  const vehicleRegNorm = d.vehicleReg?.toUpperCase().replace(/[\s\-]/g, "") ?? "";
  const primaryContractorId = d.contractorIds[0] ?? null;

  // ── Idempotency ───────────────────────────────────────────────────────────
  if (d.idempotencyKey) {
    const [hit] = await db`
      SELECT gate_event_id FROM gate_event_idempotency
      WHERE  idempotency_key = ${d.idempotencyKey} LIMIT 1
    `;
    if (hit) {
      return applySecurityHeaders(
        NextResponse.json({ eventId: hit.gate_event_id as string, duplicate: true }),
      );
    }
  }

  // ── Phase 1: all independent lookups in parallel ──────────────────────────
  //
  // Queries launched simultaneously:
  //   [0] warehouse validation
  //   [1] guard name
  //   [2] driver lookup  (by id when driverId provided, else by DL norm)
  //   [3] vehicle lookup (by id / reg / empty)
  //   [4] vehicle inside check (skipped when overrideReason set)
  //   [5] driver inside check  (skipped when overrideReason set)

  const driverQuery = d.driverId
    ? db`
        SELECT id, full_name, dl_number, contractor_id FROM drivers
        WHERE  id = ${d.driverId} AND org_id = ${actor.org} LIMIT 1
      `
    : db`
        SELECT id, full_name, dl_number, contractor_id FROM drivers
        WHERE  org_id = ${actor.org}
          AND  UPPER(REPLACE(REPLACE(dl_number, ' ', ''), '-', '')) = ${dlNorm}
        LIMIT  1
      `;

  const vehicleQuery = d.vehicleId
    ? db`
        SELECT id, contractor_id FROM vehicles
        WHERE  id = ${d.vehicleId} AND org_id = ${actor.org} LIMIT 1
      `
    : vehicleRegNorm
      ? db`
          SELECT id, contractor_id FROM vehicles
          WHERE  org_id = ${actor.org}
            AND  UPPER(REPLACE(REPLACE(registration_number, ' ', ''), '-', '')) = ${vehicleRegNorm}
          LIMIT  1
        `
      : Promise.resolve([] as Record<string, unknown>[]);

  const vehicleInsideQuery = d.overrideReason || !vehicleRegNorm
    ? Promise.resolve([] as Record<string, unknown>[])
    : db`
        SELECT gs.entry_event_id, ge.vehicle_reg, ge.person_name, ge.occurred_at
        FROM   gate_sessions gs
        JOIN   gate_events   ge ON ge.id = gs.entry_event_id
        WHERE  gs.warehouse_id = ${d.warehouseId}
          AND  gs.status = 'inside'
          AND  ge.vehicle_reg IS NOT NULL
          AND  regexp_replace(ge.vehicle_reg, '[\s\-]', '', 'g') = ${vehicleRegNorm}
        LIMIT  1
      `;

  const driverInsideQuery = d.overrideReason
    ? Promise.resolve([] as Record<string, unknown>[])
    : db`
        SELECT gs.entry_event_id, ge.person_name, ge.driver_id, ge.occurred_at
        FROM   gate_sessions gs
        JOIN   gate_events   ge ON ge.id = gs.entry_event_id
        WHERE  gs.warehouse_id = ${d.warehouseId}
          AND  gs.status = 'inside'
          AND  (
            ge.driver_id IN (
              SELECT id FROM drivers
              WHERE  org_id = ${actor.org} AND dl_number = ${dlNorm} LIMIT 1
            )
            OR ge.metadata->>'dlNumber' = ${dlNorm}
          )
        LIMIT  1
      `;

  const [
    whRows,
    guardRows,
    driverRows,
    vehicleRows,
    vehicleInsideRows,
    driverInsideRows,
  ] = await Promise.all([
    db`
      SELECT id, name FROM warehouses
      WHERE  id = ${d.warehouseId} AND org_id = ${actor.org} LIMIT 1
    `,
    db`SELECT full_name FROM users WHERE id = ${actor.sub} LIMIT 1`,
    driverQuery,
    vehicleQuery,
    vehicleInsideQuery,
    driverInsideQuery,
  ]);

  // Warehouse must exist
  if (!whRows[0]) {
    return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
  }
  const whName = whRows[0].name as string;
  const guardName = (guardRows[0]?.full_name as string) ?? "Guard";

  // Inside checks — both vehicle and driver "already inside" cases are soft
  // warnings, not blocks. A prior session may have failed to formally exit
  // (network drop, app crash, guard forgot to scan out), so guards must be
  // able to record the new entry. The conflict info is returned alongside
  // the new event so the UI can surface the warning.
  const vehicleInsideWarning = vehicleInsideRows[0]
    ? {
        type:            "duplicate_vehicle" as const,
        message:         `Vehicle ${d.vehicleReg} is already inside`,
        conflictEventId: vehicleInsideRows[0].entry_event_id as string,
      }
    : null;

  const driverInsideWarning = driverInsideRows[0]
    ? {
        type:            "duplicate_driver" as const,
        message:         `Driver with DL ${dlNorm} is already inside`,
        conflictEventId: driverInsideRows[0].entry_event_id as string,
      }
    : null;

  // ── Derive compliance statuses ────────────────────────────────────────────
  const dlStatus = dlStatusFromValidation(d.dlValidationStatus);
  const bgStatus = bgStatusFromCrime(d.crimeStep, d.crimeTotal);
  const dlExpiryIso = parseDlDateToIso(d.dlTransportValidTo);

  // ── Phase 2: driver upsert + vehicle upsert in parallel ───────────────────
  const existingDriver = driverRows[0] as { id: string; contractor_id: string | null } | undefined;
  const existingVehicle = vehicleRows[0] as { id: string; contractor_id: string | null } | undefined;

  const resolvedDriverId = existingDriver?.id ?? d.driverId ?? uuidv7();

  const driverUpsert = existingDriver
    ? db`
        UPDATE drivers SET
          full_name      = ${d.driverName || "Unverified driver"},
          dl_expiry      = ${dlExpiryIso},
          dl_status      = ${dlStatus},
          bg_status      = ${bgStatus},
          face_photo_url = ${d.facePhotoUrl ?? null},
          contractor_id  = ${primaryContractorId},
          updated_at     = ${now}
        WHERE id = ${resolvedDriverId}
      `
    : db`
        INSERT INTO drivers
          (id, org_id, full_name, dl_number, dl_expiry, dl_status, bg_status,
           face_photo_url, contractor_id, is_active)
        VALUES
          (${resolvedDriverId}, ${actor.org}, ${d.driverName || "Unverified driver"},
           ${dlNorm}, ${dlExpiryIso}, ${dlStatus}, ${bgStatus},
           ${d.facePhotoUrl ?? null}, ${primaryContractorId}, true)
      `;

  let resolvedVehicleId: string | null = null;
  let vehicleUpsert: Promise<unknown> = Promise.resolve();

  if (vehicleRegNorm) {
    resolvedVehicleId = existingVehicle?.id ?? d.vehicleId ?? uuidv7();

    vehicleUpsert = existingVehicle
      ? db`
          UPDATE vehicles SET
            contractor_id    = ${primaryContractorId ?? (existingVehicle.contractor_id ?? null)},
            owner_type       = ${primaryContractorId ? "contractor" : "owned"},
            rc_expiry        = COALESCE(${d.rcExpiry ?? null}::date, rc_expiry),
            insurance_expiry = COALESCE(${d.insuranceExpiry ?? null}::date, insurance_expiry),
            fitness_expiry   = COALESCE(${d.fitnessExpiry ?? null}::date, fitness_expiry),
            puc_expiry       = COALESCE(${d.pucExpiry ?? null}::date, puc_expiry),
            rc_owner_name    = COALESCE(${d.rcOwnerName ?? null}, rc_owner_name),
            rc_manufacturer  = COALESCE(${d.rcManufacturer ?? null}, rc_manufacturer),
            rc_vehicle_class = COALESCE(${d.rcVehicleClass ?? null}, rc_vehicle_class),
            rc_verify_provider = COALESCE(${d.rcVerifyProvider ?? null}, rc_verify_provider),
            updated_at       = ${now}
          WHERE id = ${resolvedVehicleId}
        `
      : db`
          INSERT INTO vehicles
            (id, org_id, registration_number, vehicle_type, owner_type, contractor_id,
             rc_expiry, insurance_expiry, fitness_expiry, puc_expiry,
             rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_verify_provider,
             status, is_active)
          VALUES
            (${resolvedVehicleId}, ${actor.org}, ${vehicleRegNorm}, ${d.vehicleType ?? "unknown"},
             ${primaryContractorId ? "contractor" : "owned"}, ${primaryContractorId},
             ${d.rcExpiry ?? null}, ${d.insuranceExpiry ?? null},
             ${d.fitnessExpiry ?? null}, ${d.pucExpiry ?? null},
             ${d.rcOwnerName ?? null}, ${d.rcManufacturer ?? null},
             ${d.rcVehicleClass ?? null}, ${d.rcVerifyProvider ?? null},
             'clear', true)
        `;
  }

  await Promise.all([driverUpsert, vehicleUpsert]);

  // ── Gate event + session in one transaction ────────────────────────────────
  const eventId = uuidv7();
  const metadata = {
    dlNumber:       dlNorm,
    dlImageUrl:     d.dlImageUrl ?? null,
    dlVerifyData:   d.dlVerifyData ?? null,
    crimeCheckData: d.crimeStep !== "error" ? {
      provider:     d.crimeProvider     ?? null,
      caseId:       d.crimeCaseId       ?? null,
      initiateData: d.crimeInitiateData ?? null,
      // Only persist pollData when the poll actually completed with data —
      // never store null/empty payloads from in-flight or skipped checks.
      pollData:     d.crimeStep === "done" ? (d.crimePollData ?? null) : null,
      capturedAt:   now.toISOString(),
    } : null,
    contractorIds:   d.contractorIds,
    overrideReason:  d.overrideReason ?? null,
    overriddenByUid: d.overrideReason ? actor.sub : null,
  };

  await db.begin(async (tx) => {
    await tx`
      INSERT INTO gate_events
        (id, org_id, warehouse_id, event_type, vehicle_reg, person_name, contractor_name,
         guard_id, guard_name, driver_id, vehicle_id, photo_url, status, metadata, occurred_at)
      VALUES
        (${eventId}, ${actor.org}, ${d.warehouseId}, 'contractor_entry',
         ${d.vehicleReg ?? null}, ${d.driverName}, ${d.contractorName ?? null},
         ${actor.sub}, ${guardName}, ${resolvedDriverId}, ${resolvedVehicleId},
         ${d.photoUrl ?? null}, 'inside',
         ${tx.json(metadata as Parameters<typeof tx.json>[0])}, ${eventOccurredAt})
    `;

    await tx`
      INSERT INTO gate_sessions
        (id, org_id, warehouse_id, session_type, entity_id, entry_event_id, status, entered_at)
      VALUES
        (${uuidv7()}, ${actor.org}, ${d.warehouseId}, 'driver', ${resolvedDriverId}, ${eventId}, 'inside', ${eventOccurredAt})
    `;

    if (d.idempotencyKey) {
      await tx`
        INSERT INTO gate_event_idempotency (idempotency_key, gate_event_id)
        VALUES (${d.idempotencyKey}, ${eventId})
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
    }
  });

  // ── Audit (fire-and-forget — non-critical, doesn't block response) ────────
  writeAuditEvent({
    orgId:        actor.org,
    actorId:      actor.sub,
    actorRole:    actor.role,
    action:       d.overrideReason ? "gate_event.entry_override" : "gate_event.entry",
    resourceType: "gate_event",
    resourceId:   eventId,
    warehouseId:  d.warehouseId,
    payload: {
      eventType:      "contractor_entry",
      vehicleReg:     d.vehicleReg ?? null,
      dlNumber:       dlNorm,
      driverName:     d.driverName,
      overrideReason: d.overrideReason ?? null,
    },
  }).catch(console.error);

  // ── Alerts (fire-and-forget after response) ───────────────────────────────
  // Suppressed for batch imports (suppressAlerts: true) to avoid flooding the
  // alert feed with stale historical incidents.
  if (!d.suppressAlerts) {
    const bridgedInserts: Array<{
      type: string; severity: string; message: string;
    }> = [];

    if (d.overrideReason && d.dlValidationStatus === "invalid_no_record") {
      bridgedInserts.push({
        type:     "dl_not_found",
        severity: "critical",
        message:  `Driver ${d.driverName} admitted — DL not found in government database (${dlNorm}). Override: "${d.overrideReason}".`,
      });
    }

    if (d.crimeStep === "done" && d.crimeTotal > 0) {
      const convictions = d.crimeActiveCriminal;
      const pending     = d.crimeTotal - convictions;
      const breakdown   = [
        convictions > 0 ? `${convictions} with conviction` : "",
        pending     > 0 ? `${pending} pending`             : "",
      ].filter(Boolean).join(", ");
      bridgedInserts.push({
        type:     "bg_flagged",
        severity: "critical",
        message:  `Driver ${d.driverName} flagged in background check — ${d.crimeTotal} court case(s) found (${breakdown}).`,
      });
    }

    if (bridgedInserts.length > 0) {
      Promise.allSettled(
        bridgedInserts.map((a) =>
          createBridgedAlert({
            orgId:       actor.org ?? "",
            warehouseId: d.warehouseId,
            type:        a.type,
            severity:    a.severity,
            message:     a.message,
            entityType:  "driver",
            entityId:    resolvedDriverId,
            raisedBy:    actor.sub,
            actorRole:   actor.role,
            gateEventId: eventId,
          }),
        ),
      ).catch(console.error);
    }
  }
  // Direct incident insert removed — incidents are now created exclusively
  // through createBridgedAlert above (which handles dedup so two near-
  // simultaneous gate entries for the same driver no longer pile up).

  return applySecurityHeaders(
    NextResponse.json({
      eventId,
      driverId:      resolvedDriverId,
      vehicleId:     resolvedVehicleId,
      warehouseName: whName,
      warnings:      [vehicleInsideWarning, driverInsideWarning].filter((w) => w !== null),
    }, { status: 201 }),
  );
  } catch (err) {
    console.error("[gate-entry]", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "Internal server error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  }
}
