// app/api/advisory/v1/analyze-trip/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { firecrawlSearch, firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews } from "@/app/_server/advisory/analyze";

export const maxDuration = 120; // 120 seconds timeout for thorough analysis

const AnalyzeTripSchema = z.object({
  routeId: z.string().min(1),
  routeVariant: z.number().optional(),
  origin: z.string().min(1),
  destination: z.string().min(1),
  vehicleType: z.string().optional(),
  cargoType: z.string().optional(),
  plannedDate: z.string().min(1),
  plannedTime: z.string().optional(),
});

const RISK_WEIGHTS: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  safe: 0,
};

const RISK_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  safe: 1,
};

function calculateRiskScore(disruptions: Array<{ risk_level: string | null; eta_impact_hours: number | null }>): number {
  if (disruptions.length === 0) return 0;
  
  let totalScore = 0;
  let maxImpact = 0;
  
  for (const d of disruptions) {
    const riskLevel = d.risk_level || 'safe';
    const riskScore = RISK_WEIGHTS[riskLevel] || 0;
    const impact = d.eta_impact_hours || 0;
    totalScore += riskScore;
    maxImpact = Math.max(maxImpact, impact);
  }
  
  const avgRisk = totalScore / disruptions.length;
  const impactWeight = Math.min(maxImpact * 5, 25);
  
  return Math.min(Math.round(avgRisk + impactWeight), 100);
}

function getRiskLevel(score: number): "critical" | "high" | "medium" | "low" | "safe" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "safe";
}

function getRecommendation(riskLevel: string, etaImpact: number): "dispatch" | "dispatch_early" | "delay" | "reroute" | "hold" {
  if (riskLevel === "critical") return "hold";
  if (riskLevel === "high") return etaImpact > 4 ? "reroute" : "delay";
  if (riskLevel === "medium") return etaImpact > 2 ? "delay" : "dispatch_early";
  return "dispatch";
}

function getMaxRiskLevel(levels: string[]): string {
  let maxRisk = "safe";
  for (const level of levels) {
    if (level && (RISK_ORDER[level] || 0) > (RISK_ORDER[maxRisk] || 0)) {
      maxRisk = level;
    }
  }
  return maxRisk;
}

/**
 * Generate date-aware search query for a specific segment and date
 */
function generateDateAwareSearchQuery(segment: { name: string; state?: string }, plannedDate: Date): string {
  const place = segment.state ? `${segment.name} ${segment.state}` : segment.name;
  const dateStr = plannedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const month = plannedDate.toLocaleDateString('en-US', { month: 'long' });
  
  return `(${place}) AND (
    "road blocked" OR "highway closed" OR "accident" OR "traffic jam" OR 
    "flood" OR "protest" OR "bandh" OR "strike" OR "road closure" OR 
    "landslide" OR "construction" OR "diversion" OR "traffic alert" OR
    "heavy traffic" OR "congestion" OR "vehicle breakdown" OR "police bandobast"
  ) AND (${dateStr} OR "${month}" OR "today" OR "yesterday" OR "this week")`;
}

/**
 * Generate future event search query for a specific date range
 */
function generateFutureEventQuery(segment: { name: string; state?: string }, plannedDate: Date): string {
  const place = segment.state ? `${segment.name} ${segment.state}` : segment.name;
  const dateStr = plannedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const month = plannedDate.toLocaleDateString('en-US', { month: 'long' });
  
  return `(${place}) AND (
    "scheduled" OR "upcoming" OR "will be closed" OR "announced" OR 
    "proposed" OR "planned" OR "from ${dateStr}" OR "on ${dateStr}" OR
    "from ${month}" OR "bandh call" OR "protest call" OR "march" OR "rally" OR
    "VIP movement" OR "VVIP visit" OR "convoy" OR "procession" OR "festival procession"
  ) AND ("${dateStr}" OR "${month}" OR "next week" OR "upcoming week")`;
}

// POST /api/advisory/v1/analyze-trip
export async function POST(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    const parsed = AnalyzeTripSchema.safeParse(await req.json());
    
    if (!parsed.success) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Invalid request data", details: parsed.error }, { status: 422 })
      );
    }
    
    const d = parsed.data;
    const plannedDateTime = new Date(`${d.plannedDate}T${d.plannedTime || "08:00"}:00`);
    const plannedDateOnly = new Date(d.plannedDate);
    const today = new Date();
    const isToday = plannedDateOnly.toDateString() === today.toDateString();
    const isFuture = plannedDateOnly > today;
    const daysUntil = Math.ceil((plannedDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Get corridor segments for this route - filter by variant if specified
    let segmentsQuery;
    if (d.routeVariant !== undefined) {
      segmentsQuery = await db`
        SELECT s.*, r.name as route_name, r.origin, r.destination
        FROM adv_watched_segments s
        JOIN adv_watched_routes r ON r.id = s.watched_route_id
        WHERE s.watched_route_id = ${d.routeId}
          AND s.route_variant = ${d.routeVariant}
          AND r.org_id = ${claims.org}
        ORDER BY s.seq
      `;
    } else {
      segmentsQuery = await db`
        SELECT s.*, r.name as route_name, r.origin, r.destination
        FROM adv_watched_segments s
        JOIN adv_watched_routes r ON r.id = s.watched_route_id
        WHERE s.watched_route_id = ${d.routeId}
          AND r.org_id = ${claims.org}
        ORDER BY s.route_variant, s.seq
      `;
    }
    
    const segments = segmentsQuery as unknown as Array<{
      id: string;
      name: string;
      segment_type: string;
      state: string | null;
      route_variant: number;
      seq: number;
      has_disruption: boolean;
      disruption_risk_level: string | null;
      disruption_title: string | null;
      disruption_summary: string | null;
      disruption_eta_hours: number | null;
      disruption_category: string | null;
      last_checked_at: string | null;
      route_name: string;
      origin: string;
      destination: string;
    }>;
    
    if (segments.length === 0) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Route not found or no segments available" }, { status: 404 })
      );
    }
    
    // Get stored disruptions from database
    const storedDisruptions = segments
      .filter(s => s.has_disruption && s.disruption_risk_level && s.disruption_risk_level !== 'safe')
      .map(s => ({
        id: s.id,
        title: s.disruption_title || `Disruption on ${s.name}`,
        summary: s.disruption_summary || `Active issue detected on ${s.name}`,
        risk_level: s.disruption_risk_level || 'medium',
        eta_impact_hours: s.disruption_eta_hours || 2,
        category: s.disruption_category || 'unknown',
        segment: s.name,
        segmentType: s.segment_type,
        state: s.state,
        lastChecked: s.last_checked_at,
      }));
    
    // Search for disruptions
    const liveDisruptions: Array<{
      id: string;
      title: string;
      summary: string;
      risk_level: string;
      eta_impact_hours: number;
      category: string;
      segment: string;
      segmentType: string;
      state: string | null;
      source: string;
    }> = [];
    
    const scheduledEvents: Array<{
      id: string;
      title: string;
      summary: string;
      risk_level: string;
      eta_impact_hours: number;
      category: string;
      segment: string;
      segmentType: string;
      state: string | null;
      eventDate: string;
      source: string;
    }> = [];
    
    if (isFuture && daysUntil <= 30) {
      // Search for scheduled/future events
      for (const segment of segments) {
        try {
          const futureQuery = generateFutureEventQuery(
            { name: segment.name, state: segment.state || undefined },
            plannedDateOnly
          );
          
          const hits = await firecrawlSearch(futureQuery, 5);
          
          for (const hit of hits) {
            let scraped;
            try {
              scraped = await firecrawlScrape(hit.url);
            } catch {
              scraped = { markdown: hit.description, title: hit.title };
            }
            
            const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
            if (!content) continue;
            
            const result = await analyzeNews(content, { 
              segment: segment.name, 
              state: segment.state || undefined, 
              todayIso: plannedDateOnly.toISOString().slice(0, 10),
            });
            
            const isRelevant = result.isRelevant && 
              (result.eventType === "scheduled" || result.eventType === "ongoing") &&
              result.riskLevel !== "safe";
            
            if (isRelevant) {
              scheduledEvents.push({
                id: segment.id,
                title: result.title,
                summary: result.summary || `Scheduled event on ${segment.name}`,
                risk_level: result.riskLevel,
                eta_impact_hours: result.etaImpactHours,
                category: result.category,
                segment: segment.name,
                segmentType: segment.segment_type,
                state: segment.state,
                eventDate: result.eventDate || plannedDateOnly.toISOString(),
                source: hit.url,
              });
            }
          }
        } catch (err) {
          console.error(`Future event search failed for ${segment.name}:`, err);
        }
      }
    } else if (!isFuture || daysUntil <= 7) {
      // For today or recent past, do live search
      for (const segment of segments) {
        try {
          const dateAwareQuery = generateDateAwareSearchQuery(
            { name: segment.name, state: segment.state || undefined },
            plannedDateOnly
          );
          
          const hits = await firecrawlSearch(dateAwareQuery, 5);
          
          for (const hit of hits) {
            let scraped;
            try {
              scraped = await firecrawlScrape(hit.url);
            } catch {
              scraped = { markdown: hit.description, title: hit.title };
            }
            
            const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
            if (!content) continue;
            
            const result = await analyzeNews(content, { 
              segment: segment.name, 
              state: segment.state || undefined, 
              todayIso: plannedDateOnly.toISOString().slice(0, 10),
            });
            
            const isRelevant = result.isRelevant && 
              result.eventType === "ongoing" && 
              result.riskLevel !== "safe";
            
            if (isRelevant) {
              liveDisruptions.push({
                id: segment.id,
                title: result.title,
                summary: result.summary || `Active disruption on ${segment.name}`,
                risk_level: result.riskLevel,
                eta_impact_hours: result.etaImpactHours,
                category: result.category,
                segment: segment.name,
                segmentType: segment.segment_type,
                state: segment.state,
                source: hit.url,
              });
            }
          }
        } catch (err) {
          console.error(`Live search failed for ${segment.name}:`, err);
        }
      }
    }
    
    // Get scheduled events from database for future dates
    if (isFuture) {
      const dbScheduledEvents = await db`
        SELECT * FROM adv_corridor_events
        WHERE watched_route_id = ${d.routeId}
          AND event_type = 'scheduled'
          AND event_start_at::date <= ${plannedDateOnly.toISOString().slice(0, 10)}
          AND event_start_at::date >= ${new Date(plannedDateOnly.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
        ORDER BY event_start_at ASC
      ` as unknown as Array<{
        id: string;
        title: string;
        summary: string | null;
        risk_level: string;
        eta_impact_hours: number;
        category: string;
        event_start_at: string;
        duration_days: number;
        segment_id: string;
      }>;
      
      for (const event of dbScheduledEvents) {
        const segment = segments.find(s => s.id === event.segment_id);
        if (segment) {
          scheduledEvents.push({
            id: event.id,
            title: event.title,
            summary: event.summary || `Scheduled event on ${segment.name}`,
            risk_level: event.risk_level,
            eta_impact_hours: event.eta_impact_hours,
            category: event.category,
            segment: segment.name,
            segmentType: segment.segment_type,
            state: segment.state,
            eventDate: event.event_start_at,
            source: "database",
          });
        }
      }
    }
    
    // Combine all disruptions
    const allDisruptions = [...storedDisruptions, ...liveDisruptions];
    
    // Calculate metrics per segment
    const segmentAnalysis = segments.map(segment => {
      const disruptionsForSegment = allDisruptions.filter(d => d.id === segment.id);
      const hasDisruption = disruptionsForSegment.length > 0;
      const riskLevels = disruptionsForSegment.map(d => d.risk_level);
      const maxRisk = hasDisruption ? getMaxRiskLevel(riskLevels) : "safe";
      const totalEta = disruptionsForSegment.reduce((sum, d) => sum + (d.eta_impact_hours || 0), 0);
      
      return {
        id: segment.id,
        name: segment.name,
        type: segment.segment_type,
        state: segment.state,
        seq: segment.seq,
        hasDisruption,
        riskLevel: maxRisk,
        etaImpact: totalEta,
        disruptions: disruptionsForSegment.map(d => ({
          title: d.title,
          summary: d.summary,
          risk: d.risk_level,
          eta_impact_hours: d.eta_impact_hours,
          category: d.category,
        })),
      };
    });
    
    // Calculate overall metrics
    const riskScore = calculateRiskScore(allDisruptions.map(d => ({
      risk_level: d.risk_level,
      eta_impact_hours: d.eta_impact_hours,
    })));
    
    const riskLevel = getRiskLevel(riskScore);
    const etaImpactHours = Math.max(
      ...allDisruptions.map(d => d.eta_impact_hours || 0),
      ...scheduledEvents.map(e => e.eta_impact_hours || 0),
      0
    );
    
    const recommendation = getRecommendation(riskLevel, etaImpactHours);
    
    // Calculate safe window
    const safeWindowFrom = plannedDateTime.toISOString();
    let safeWindowTo = new Date(plannedDateTime.getTime() + 24 * 60 * 60 * 1000).toISOString();
    
    if (scheduledEvents.length > 0) {
      const earliestEvent = scheduledEvents[0];
      const eventDate = new Date(earliestEvent.eventDate);
      if (eventDate > plannedDateTime) {
        safeWindowTo = eventDate.toISOString();
      }
    }
    
    // Generate AI narrative
    let aiNarrative = "";
    const disruptedSegments = segmentAnalysis.filter(s => s.hasDisruption);
    const highRiskEvents = scheduledEvents.filter(e => e.risk_level === "critical" || e.risk_level === "high");
    
    if (disruptedSegments.length === 0 && scheduledEvents.length === 0) {
      aiNarrative = `✅ Route from ${d.origin} to ${d.destination} appears clear for ${plannedDateOnly.toLocaleDateString()}. All ${segments.length} segments analyzed with no active disruptions or scheduled events detected. Recommended to proceed as planned.`;
    } else if (disruptedSegments.length > 0) {
      const highRiskDisruptions = allDisruptions.filter(d => d.risk_level === "critical" || d.risk_level === "high");
      const segmentsWithIssues = [...new Set(disruptedSegments.map(s => s.name))];
      
      if (highRiskDisruptions.length > 0) {
        aiNarrative = `⚠️ HIGH RISK: ${disruptedSegments.length} segment(s) on this route have active disruptions:\n• ${segmentsWithIssues.slice(0, 5).join("\n• ")}${segmentsWithIssues.length > 5 ? `\n• +${segmentsWithIssues.length - 5} more` : ''}\n\nEstimated ${etaImpactHours}h total delay expected. Critical/High risk disruptions detected. Recommendation: Consider alternative routes or delaying dispatch until conditions improve.`;
      } else {
        aiNarrative = `⚠️ MODERATE RISK: ${disruptedSegments.length} segment(s) on this route have minor disruptions:\n• ${segmentsWithIssues.slice(0, 3).join("\n• ")}${segmentsWithIssues.length > 3 ? `\n• +${segmentsWithIssues.length - 3} more` : ''}\n\nEstimated ${etaImpactHours}h delay possible. Exercise caution and monitor conditions.`;
      }
    } else if (scheduledEvents.length > 0) {
      aiNarrative = `📅 SCHEDULED EVENTS: ${scheduledEvents.length} scheduled event(s) detected near your dispatch window:\n• ${scheduledEvents.slice(0, 3).map(e => e.title).join("\n• ")}\n\nThese may cause delays on ${plannedDateOnly.toLocaleDateString()}. Plan accordingly and consider adjusting dispatch timing.`;
    }
    
    // Prepare alternative routes
    const allVariants = [...new Set(segments.map(s => s.route_variant))];
    const currentVariant = d.routeVariant !== undefined ? d.routeVariant : segments[0]?.route_variant || 0;
    const otherVariants = allVariants.filter(v => v !== currentVariant);
    
    const alternativeRoutes = otherVariants.map(v => {
      const variantSegments = segments.filter(s => s.route_variant === v);
      const variantDisruptions = allDisruptions.filter(d => variantSegments.some(s => s.id === d.id));
      const variantHasDisruption = variantDisruptions.length > 0;
      const variantEta = variantDisruptions.reduce((sum, d) => sum + (d.eta_impact_hours || 0), 0);
      
      return {
        label: v === 0 ? "Primary Route" : `Alternative Route ${v}`,
        via: `Variant ${v}`,
        extraKm: 0,
        extraHours: Math.max(0, variantEta - etaImpactHours),
        riskLevel: variantHasDisruption ? "medium" : "low",
        riskScore: variantHasDisruption ? riskScore - 20 : riskScore - 30,
      };
    });
    
    // Return comprehensive analysis
    return applySecurityHeaders(NextResponse.json({
      route: {
        id: d.routeId,
        name: segments[0]?.route_name || `${d.origin} → ${d.destination}`,
        origin: d.origin,
        destination: d.destination,
        totalSegments: segments.length,
        analyzedVariant: currentVariant,
        totalVariants: allVariants.length,
      },
      plannedDateTime: plannedDateTime.toISOString(),
      plannedDate: plannedDateOnly.toISOString().slice(0, 10),
      isToday,
      isFuture,
      daysUntil: isFuture ? daysUntil : 0,
      riskScore,
      riskLevel,
      recommendation,
      etaImpactHours,
      safeWindowFrom,
      safeWindowTo,
      segmentAnalysis,
      activeDisruptions: allDisruptions.map(d => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        risk: d.risk_level,
        eta_impact_hours: d.eta_impact_hours,
        category: d.category,
        segment: d.segment,
        segmentType: d.segmentType,
        state: d.state,
      })),
      scheduledEvents: scheduledEvents.map(e => ({
        id: e.id,
        title: e.title,
        summary: e.summary,
        risk: e.risk_level,
        eta_impact_hours: e.eta_impact_hours,
        category: e.category,
        segment: e.segment,
        eventDate: e.eventDate,
      })),
      alternativeRoutes,
      aiNarrative,
      dataSource: isFuture ? "scheduled_events" : (liveDisruptions.length > 0 ? "live_search" : "cached"),
    }, { status: 200 }));
    
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401) {
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    console.error("[analyze-trip] POST error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}