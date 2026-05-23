// app/api/advisory/v1/planned-dispatches/[id]/route.ts
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { NextRequest, NextResponse } from "next/server";

// GET /api/advisory/v1/planned-dispatches/[id] — get specific dispatch with segments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const claims = await requireUser(req);
    const { id } = await params; // ✅ Await the params Promise
    
    console.log("[planned-dispatches] Fetching dispatch with ID:", id);
    
    const [dispatch] = await db`
      SELECT 
        pd.*,
        wr.name as corridor_name,
        wr.origin as corridor_origin,
        wr.destination as corridor_destination,
        wr.max_risk_level as corridor_risk,
        wr.disruption_count as corridor_disruptions,
        wr.last_intel_at as corridor_last_intel
      FROM adv_planned_dispatches pd
      JOIN adv_watched_routes wr ON wr.id = pd.watched_route_id
      WHERE pd.id = ${id} AND pd.org_id = ${claims.org}
    `;
    
    if (!dispatch) {
      console.log("[planned-dispatches] Dispatch not found:", id);
      return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }
    
    const segments = await db`
      SELECT 
        id,
        planned_dispatch_id,
        segment_id,
        name,
        segment_type,
        state,
        seq,
        has_disruption,
        risk_level,
        eta_impact_hours,
        disruption_details,
        created_at
      FROM adv_planned_dispatch_segments
      WHERE planned_dispatch_id = ${id}
      ORDER BY seq
    `;
    
    // Parse JSONB disruption_details if needed
    const parsedSegments = segments.map((segment: any) => ({
      ...segment,
      disruption_details: typeof segment.disruption_details === 'string' 
        ? JSON.parse(segment.disruption_details) 
        : segment.disruption_details || []
    }));
    
    console.log("[planned-dispatches] Found dispatch with", parsedSegments.length, "segments");
    
    return applySecurityHeaders(NextResponse.json({ dispatch, segments: parsedSegments }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401) {
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    
    console.error("[planned-dispatches] GET detail error:", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}