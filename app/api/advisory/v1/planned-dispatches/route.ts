// app/api/advisory/v1/planned-dispatches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/advisory/v1/planned-dispatches — list all planned dispatches for the org
export async function GET(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    
    const rows = await db`
      SELECT 
        pd.*,
        wr.name as corridor_name,
        wr.max_risk_level as corridor_risk,
        wr.disruption_count as corridor_disruptions
      FROM adv_planned_dispatches pd
      JOIN adv_watched_routes wr ON wr.id = pd.watched_route_id
      WHERE pd.org_id = ${claims.org}
      ORDER BY pd.created_at DESC
    `;
    
    return applySecurityHeaders(NextResponse.json({ plannedDispatches: rows }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    
    console.error("[planned-dispatches] GET error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}

// GET /api/advisory/v1/planned-dispatches/:id — get specific dispatch with segments
export async function GET_DETAIL(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const claims = await requireUser(req);
    
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
      WHERE pd.id = ${params.id} AND pd.org_id = ${claims.org}
    `;
    
    if (!dispatch) {
      return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }
    
    const segments = await db`
      SELECT * FROM adv_planned_dispatch_segments
      WHERE planned_dispatch_id = ${params.id}
      ORDER BY seq
    `;
    
    return applySecurityHeaders(NextResponse.json({ dispatch, segments }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    
    console.error("[planned-dispatches] GET detail error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}

const CreateTripSchema = z.object({
  name: z.string().max(160).optional(),
  watchedRouteId: z.string().min(1), // Links to adv_watched_routes
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  cargoType: z.string().max(80).optional(),
  vehicleType: z.string().max(80).optional(),
  scheduledDate: z.string().optional(),
  notes: z.string().optional(),
  routeVariant: z.number().optional(),
  segmentAnalysis: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    state: z.string().nullable(),
    seq: z.number(),
    hasDisruption: z.boolean(),
    riskLevel: z.string(),
    etaImpact: z.number(),
    disruptions: z.array(z.object({
      title: z.string(),
      summary: z.string(),
      risk: z.string(),
      eta_impact_hours: z.number(),
      category: z.string(),
    })).optional(),
  })).optional(),
  analysisData: z.object({
    riskScore: z.number(),
    riskLevel: z.string(),
    recommendation: z.string(),
    etaImpactHours: z.number(),
    safeWindowFrom: z.string(),
    safeWindowTo: z.string(),
    aiNarrative: z.string(),
    selectedRouteName: z.string().optional(),
    selectedRouteVariant: z.number().optional(),
  }).optional(),
});

// POST /api/advisory/v1/planned-dispatches — create a new trip linked to a watched route
export async function POST(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    const parsed = CreateTripSchema.safeParse(await req.json());
    
    if (!parsed.success) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Invalid request data", details: parsed.error }, { status: 422 }),
      );
    }
    
    const d = parsed.data;
    const id = uuidv7();
    const now = new Date().toISOString();

    // Verify watched route exists and belongs to org
    const watchedRoute = await db`
      SELECT id, name, origin, destination 
      FROM adv_watched_routes
      WHERE id = ${d.watchedRouteId} AND org_id = ${claims.org}
    `;
    
    if (watchedRoute.length === 0) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Watched route not found or unauthorized" }, { status: 404 }),
      );
    }

    // Build detailed notes with segment information
    let detailedNotes = d.notes || "";
    if (d.segmentAnalysis && d.segmentAnalysis.length > 0) {
      const disruptedSegments = d.segmentAnalysis.filter(s => s.hasDisruption);
      const clearSegments = d.segmentAnalysis.filter(s => !s.hasDisruption);
      
      detailedNotes = `
${d.notes ? d.notes + "\n\n" : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TRIP ANALYSIS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Risk Score: ${d.analysisData?.riskScore || 0}/100
Risk Level: ${d.analysisData?.riskLevel?.toUpperCase() || "UNKNOWN"}
Recommendation: ${d.analysisData?.recommendation || "UNKNOWN"}
ETA Impact: +${d.analysisData?.etaImpactHours || 0}h
Selected Route: ${d.analysisData?.selectedRouteName || "Primary Route"} (Variant ${d.routeVariant || 0})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 SEGMENT BREAKDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Segments: ${d.segmentAnalysis.length}
✅ Clear Segments: ${clearSegments.length}
⚠️ Disrupted Segments: ${disruptedSegments.length}

${disruptedSegments.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ DISRUPTED SEGMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${disruptedSegments.map(seg => `
📍 ${seg.name} (${seg.type})${seg.state ? ` - ${seg.state}` : ''}
   Risk: ${seg.riskLevel.toUpperCase()} | Delay: +${seg.etaImpact}h
   ${seg.disruptions?.map(d => `   • ${d.title}`).join('\n') || '   • Active disruption detected'}
`).join('\n')}
` : '✅ No disruptions detected on any segment'}

${clearSegments.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CLEAR SEGMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${clearSegments.slice(0, 10).map(seg => `📍 ${seg.name} (${seg.type})${seg.state ? ` - ${seg.state}` : ''}`).join('\n')}
${clearSegments.length > 10 ? `\n... and ${clearSegments.length - 10} more clear segments` : ''}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${d.analysisData?.aiNarrative || ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `;
    }

    await db`
      INSERT INTO adv_planned_dispatches (
        id, org_id, watched_route_id, name, origin, destination, 
        cargo_type, vehicle_type, scheduled_date, notes, 
        route_variant, risk_score, risk_level, recommendation,
        eta_impact_hours, safe_window_from, safe_window_to, ai_narrative,
        created_at, updated_at
      ) VALUES (
        ${id}, ${claims.org}, ${d.watchedRouteId}, ${d.name ?? ""},
        ${d.origin}, ${d.destination}, ${d.cargoType ?? null},
        ${d.vehicleType ?? null}, ${d.scheduledDate ?? null},
        ${detailedNotes},
        ${d.routeVariant ?? 0},
        ${d.analysisData?.riskScore ?? null},
        ${d.analysisData?.riskLevel ?? null},
        ${d.analysisData?.recommendation ?? null},
        ${d.analysisData?.etaImpactHours ?? null},
        ${d.analysisData?.safeWindowFrom ?? null},
        ${d.analysisData?.safeWindowTo ?? null},
        ${d.analysisData?.aiNarrative ?? null},
        ${now}, ${now}
      )
    `;
    
    // Store segment analysis
    if (d.segmentAnalysis && d.segmentAnalysis.length > 0) {
      for (const seg of d.segmentAnalysis) {
        await db`
          INSERT INTO adv_planned_dispatch_segments (
            id, planned_dispatch_id, segment_id, name, segment_type,
            state, seq, has_disruption, risk_level, eta_impact_hours,
            disruption_details, created_at
          ) VALUES (
            ${uuidv7()}, ${id}, ${seg.id}, ${seg.name}, ${seg.type},
            ${seg.state}, ${seg.seq}, ${seg.hasDisruption}, ${seg.riskLevel},
            ${seg.etaImpact}, ${JSON.stringify(seg.disruptions || [])}, ${now}
          )
        `;
      }
    }
    
    return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    
    console.error("[planned-dispatches] POST error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}