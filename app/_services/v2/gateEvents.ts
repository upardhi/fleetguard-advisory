import { api } from "./api";

export interface GateEventV2 {
  id:             string;
  eventType:      string;
  vehicleReg:     string | null;
  personName:     string | null;
  contractorName: string | null;
  guardName:      string;
  tripId:         string | null;
  driverId:       string | null;
  vehicleId:      string | null;
  photoUrl:       string | null;
  status:         "inside" | "exited" | "denied";
  occurredAt:     string;
}

export async function getGateEvents(params?: {
  warehouseId?: string; eventType?: string; since?: string;
  limit?: number; offset?: number;
}): Promise<{ events: GateEventV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.warehouseId)     q.set("warehouseId", params.warehouseId);
  if (params?.eventType)       q.set("eventType",   params.eventType);
  if (params?.since)           q.set("since",       params.since);
  if (params?.limit  != null)  q.set("limit",       String(params.limit));
  if (params?.offset != null)  q.set("offset",      String(params.offset));
  const data = await api.get<{ events: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/gate-events?${q}`
  );
  return {
    events: data.events.map((e) => ({
      id:             e.id as string,
      eventType:      e.event_type as string,
      vehicleReg:     (e.vehicle_reg as string | null) ?? null,
      personName:     (e.person_name as string | null) ?? null,
      contractorName: (e.contractor_name as string | null) ?? null,
      guardName:      e.guard_name as string,
      tripId:         (e.trip_id as string | null) ?? null,
      driverId:       (e.driver_id as string | null) ?? null,
      vehicleId:      (e.vehicle_id as string | null) ?? null,
      photoUrl:       (e.photo_url as string | null) ?? null,
      status:         e.status as "inside" | "exited" | "denied",
      occurredAt:     e.occurred_at as string,
    })),
    limit:  data.limit,
    offset: data.offset,
  };
}

export async function createGateEvent(body: {
  warehouseId: string; eventType: string; gateId?: string;
  vehicleReg?: string; personName?: string; contractorName?: string;
  tripId?: string; driverId?: string; vehicleId?: string;
  photoUrl?: string; status?: string; metadata?: Record<string, unknown>;
}): Promise<{ id: string; occurredAt: string }> {
  return api.post("/api/v2/gate-events", body);
}
