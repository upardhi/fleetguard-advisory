import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const GateEventSchema = z.object({
  warehouseId: z.string(),
  gateId: z.string().nullable().optional(),
  eventType: z.enum([
    "inbound_entry", "inbound_exit",
    "outbound_entry", "outbound_exit",
    "visitor_entry", "visitor_exit",
    "contractor_entry", "contractor_exit",
  ]),
  vehicleReg: z.string().max(30).nullable().optional(),
  personName: z.string().max(200).nullable().optional(),
  contractorName: z.string().max(200).nullable().optional(),
  tripId: z.string().nullable().optional(),
  driverId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  status: z.enum(["inside", "exited", "denied"]).default("inside"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().nullable().optional(),  // ISO timestamp; overrides server now for historical imports
});

// POST /api/v2/gate-events — append a gate event (immutable once written)
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "guard", "wh_manager", "regional_manager"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = GateEventSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;

  // Idempotency: if the client sent an Idempotency-Key header and we've already
  // processed it, return the original event id without creating a duplicate.
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
  if (idempotencyKey) {
    const [existing] = await db`
      SELECT gate_event_id, created_at
      FROM   gate_event_idempotency
      WHERE  idempotency_key = ${idempotencyKey}
      LIMIT  1
    `;
    if (existing) {
      return applySecurityHeaders(
        NextResponse.json({ id: existing.gate_event_id, occurredAt: existing.created_at }, { status: 200 }),
      );
    }
  }

  // Verify warehouse belongs to org
  const [wh] = await db`
    SELECT id FROM warehouses WHERE id = ${data.warehouseId} AND org_id = ${actor.org} LIMIT 1
  `;
  if (!wh) {
    return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
  }

  // Fetch guard name from users table
  const [guardUser] = await db`SELECT full_name FROM users WHERE id = ${actor.sub} LIMIT 1`;
  const guardName = (guardUser?.full_name as string) ?? "System";

  const id = uuidv7();
  const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

  // Wrap the gate_events INSERT, the gate_sessions write, AND the idempotency
  // mapping in a single transaction. Either all three commit or none — no
  // half-applied state if a network blip happens mid-write.
  try {
    await db.begin(async (tx) => {
      await tx`
        INSERT INTO gate_events (
          id, org_id, warehouse_id, gate_id, event_type,
          vehicle_reg, person_name, contractor_name,
          guard_id, guard_name, trip_id, driver_id, vehicle_id,
          photo_url, status, metadata, occurred_at
        ) VALUES (
          ${id}, ${actor.org}, ${data.warehouseId}, ${data.gateId ?? null},
          ${data.eventType},
          ${data.vehicleReg ?? null}, ${data.personName ?? null}, ${data.contractorName ?? null},
          ${actor.sub}, ${guardName}, ${data.tripId ?? null},
          ${data.driverId ?? null}, ${data.vehicleId ?? null},
          ${data.photoUrl ?? null}, ${data.status},
          ${tx.json((data.metadata ?? {}) as Parameters<typeof tx.json>[0])},
          ${occurredAt}
        )
      `;

      if (["inbound_entry", "outbound_entry", "visitor_entry", "contractor_entry"].includes(data.eventType)) {
        await tx`
          INSERT INTO gate_sessions (
            id, org_id, warehouse_id, session_type, entity_id, entry_event_id, status, entered_at
          ) VALUES (
            ${uuidv7()}, ${actor.org}, ${data.warehouseId},
            ${data.driverId ? "driver" : data.vehicleId ? "vehicle" : "visitor"},
            ${data.driverId ?? data.vehicleId ?? null},
            ${id}, 'inside', ${occurredAt}
          )
        `;
      } else if (["inbound_exit", "outbound_exit", "visitor_exit", "contractor_exit"].includes(data.eventType)) {
        const entityId = data.driverId ?? data.vehicleId;
        if (entityId) {
          await tx`
            UPDATE gate_sessions
            SET    status = 'exited', exit_event_id = ${id}, exited_at = ${occurredAt}
            WHERE  entity_id = ${entityId}
              AND  warehouse_id = ${data.warehouseId}
              AND  status = 'inside'
          `;
        }
      }

      if (idempotencyKey) {
        await tx`
          INSERT INTO gate_event_idempotency (idempotency_key, gate_event_id)
          VALUES (${idempotencyKey}, ${id})
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
      }
    });
  } catch (err) {
    // If two requests with the same idempotency key arrived concurrently, the
    // first wins. Re-fetch and return its id rather than surfacing a constraint
    // error to the caller.
    if (idempotencyKey) {
      const [existing] = await db`
        SELECT gate_event_id, created_at
        FROM   gate_event_idempotency
        WHERE  idempotency_key = ${idempotencyKey}
        LIMIT  1
      `;
      if (existing) {
        return applySecurityHeaders(
          NextResponse.json({ id: existing.gate_event_id, occurredAt: existing.created_at }, { status: 200 }),
        );
      }
    }
    throw err;
  }

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "gate_event.created",
    resourceType: "gate_event",
    resourceId: id,
    warehouseId: data.warehouseId,
    payload: { eventType: data.eventType, vehicleReg: data.vehicleReg },
  });

  return applySecurityHeaders(
    NextResponse.json({ id, occurredAt }, { status: 201 }),
  );
}

// GET /api/v2/gate-events — list events with filtering
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const eventType   = searchParams.get("eventType");
  const since       = searchParams.get("since"); // ISO date
  const status      = searchParams.get("status"); // inside | exited | denied
  const driverId    = searchParams.get("driverId");
  const tripId      = searchParams.get("tripId");
  const limit  = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);

  // wh_manager is scoped to their warehouse
  const effectiveWarehouse = actor.role === "wh_manager"
    ? (await db`SELECT warehouse_id FROM users WHERE id = ${actor.sub} LIMIT 1`)[0]?.warehouse_id
    : warehouseId;

  // wh_manager with no warehouse assignment must NOT fall through to an
  // org-wide query — that would surface events from every warehouse in the
  // org. Return an empty list instead so dashboards stay correctly scoped.
  if (actor.role === "wh_manager" && !effectiveWarehouse) {
    return applySecurityHeaders(NextResponse.json({ events: [], limit, offset }));
  }

  // Compose dynamic WHERE so every filter (incl. status) is respected.
  const events = await db`
    SELECT id, event_type, vehicle_reg, person_name, contractor_name, guard_name,
           trip_id, driver_id, vehicle_id, photo_url, status, occurred_at,
           warehouse_id, org_id,
           -- Normalise contractorIds: older mobile builds stored it as a JSON-encoded
           -- string ("[\"id\"]") instead of a proper array. Convert transparently so
           -- the client always receives an array regardless of the app version.
           CASE
             WHEN jsonb_typeof(metadata->'contractorIds') = 'string'
             THEN metadata || jsonb_build_object('contractorIds', (metadata->>'contractorIds')::jsonb)
             ELSE metadata
           END AS metadata
    FROM   gate_events
    WHERE  org_id = ${actor.org}
      ${effectiveWarehouse ? db`AND warehouse_id = ${effectiveWarehouse}` : db``}
      ${eventType          ? db`AND event_type   = ${eventType}`          : db``}
      ${since              ? db`AND occurred_at >= ${since}`               : db``}
      ${status             ? db`AND status       = ${status}`             : db``}
      ${driverId           ? db`AND driver_id    = ${driverId}`           : db``}
      ${tripId             ? db`AND trip_id      = ${tripId}`             : db``}
    ORDER  BY occurred_at DESC LIMIT ${limit} OFFSET ${offset}
  `;

  return applySecurityHeaders(NextResponse.json({ events, limit, offset }));
}
