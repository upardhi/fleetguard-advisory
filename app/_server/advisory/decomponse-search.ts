/**
 * decompose.ts
 *
 * Builds optimised search queries for route-segment intelligence.
 *
 * Categories covered (per Umashankar Sir's guidance — 27 May 2026):
 *   • Govt / regulatory safety advisories  (SDMA, DM, Police, NHAI, MoRTH)
 *   • Weather alerts                        (IMD, SDMA, flood / cyclone bulletins)
 *   • VVIP movements                        (President, PM, CM — advance traffic orders)
 *   • Planned religious events              (mela, yatra, bandh, procession, puja)
 *   • Political events / rallies            (election, political meeting, morcha)
 *   • Traffic diversions / road closures    (commissionerate orders, police advisories)
 *   • Strikes / bandhs                      (trade, transport, chakka jam)
 *   • Infrastructure disruptions            (NH closure, bridge repair, highway block)
 *   • Natural disasters                     (flood, landslide, cyclone, earthquake)
 *
 * Query design principles:
 *   1. Always anchor on segment name + state to stay geo-precise.
 *   2. Always include OFFICIAL SOURCE SIGNALS — the exact language that appears
 *      in govt press releases and local newspaper reprintings of those releases
 *      (e.g. "traffic advisory", "diversion order", "commissionerate", "SDMA").
 *   3. Use OR-groups so a single query casts a wide but relevant net.
 *   4. Keep queries under ~200 chars so search engines don't truncate them.
 */

interface SegmentCtx {
  name: string;
  state?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds the geo-anchor prefix used in every query variant. */
function geo(ctx: SegmentCtx): string {
  return ctx.state ? `${ctx.name} ${ctx.state}` : ctx.name;
}

// ── CURRENT DISRUPTIONS ───────────────────────────────────────────────────────
// Used for the "last 24 hours" search pass (tbs=qdr:d in Firecrawl).
// Each function returns one focused query string.

/**
 * Primary query — broadest disruption signals.
 * Catches police advisories, highway closures, and official alerts published
 * by district authorities to social media / local press.
 */
export function currentSearchQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `"traffic advisory" OR "traffic diversion" OR "route diversion" OR ` +
    `"road closed" OR "highway blocked" OR "NH closed" OR ` +
    `"traffic alert" OR "traffic disruption" OR "commissionerate" OR ` +
    `"police advisory" OR "traffic police" OR ` +
    `flood OR landslide OR "road blocked" OR accident OR protest OR bandh` +
    `)`
  );
}

/**
 * Weather + disaster query — targets IMD bulletins and SDMA releases
 * that are reprinted verbatim by local newspapers.
 */
export function currentWeatherQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `"weather alert" OR "weather advisory" OR "IMD alert" OR ` +
    `"red alert" OR "orange alert" OR "yellow alert" OR ` +
    `"heavy rain" OR "flash flood" OR flood OR cyclone OR ` +
    `"SDMA" OR "disaster management" OR "public safety alert" OR ` +
    `landslide OR "road washout" OR "bridge damage"` +
    `)`
  );
}

/**
 * VVIP movement query — advance orders from traffic commissioners.
 * VVIP routes are always notified in advance by police commissionerates.
 */
export function currentVvipQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `"VVIP movement" OR "VIP movement" OR "VVIP route" OR ` +
    `"Prime Minister visit" OR "Chief Minister visit" OR "President visit" OR ` +
    `"security arrangement" OR "traffic restriction" OR "road block" OR ` +
    `"convoy" OR "protocol" OR "special arrangement"` +
    `)`
  );
}

/**
 * Religious event + mela query — catches Ganga Dussehra-style advisories
 * (as in Image 2) where police publish multi-point diversion notices.
 */
export function currentReligiousQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `mela OR yatra OR "religious procession" OR "shobha yatra" OR ` +
    `"puja procession" OR "rath yatra" OR "kumbh" OR "kanwar" OR ` +
    `"Ganga" OR "ghat" OR "immersion" OR "visarjan" OR ` +
    `bandh OR "chakka jam" OR "rasta roko" OR ` +
    `"traffic diversion" OR "route closed" OR "road blocked"` +
    `)`
  );
}

/**
 * Political event + strike query.
 */
export function currentPoliticalQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `bandh OR strike OR "chakka jam" OR "rail roko" OR "bharat bandh" OR ` +
    `rally OR "political rally" OR "public meeting" OR "morcha" OR ` +
    `protest OR agitation OR "road block" OR "highway block"` +
    `)`
  );
}

// ── FUTURE / SCHEDULED EVENTS ─────────────────────────────────────────────────
// Used for the "next 30 days" pass (no date restriction in Firecrawl).

/**
 * Future traffic + event query — catches advance diversion orders and
 * scheduled events announced by police / event organisers.
 */
export function futureSearchQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `"traffic advisory" OR "traffic diversion" OR "route diversion" OR ` +
    `"road closed" OR "diversion order" OR "advance notice" OR ` +
    `"upcoming" OR "scheduled" OR "planned" OR "announced" OR ` +
    `mela OR yatra OR rally OR bandh OR "chakka jam" OR ` +
    `"NHAI" OR "road work" OR "construction" OR "bridge work"` +
    `)`
  );
}

/**
 * Future religious / cultural event query.
 */
export function futureReligiousQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `mela OR yatra OR "religious event" OR "procession" OR ` +
    `"puja" OR "festival" OR "fair" OR "kumbh" OR "kanwar" OR ` +
    `"traffic diversion" OR "route change" OR "road closed"` +
    `)`
  );
}

/**
 * Future infrastructure disruption query.
 * NHAI and MoRTH publish advance notices for closures and repairs.
 */
export function futureInfraQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `"NHAI" OR "MoRTH" OR "PWD" OR "highway authority" OR ` +
    `"road construction" OR "bridge repair" OR "widening" OR ` +
    `"lane closed" OR "night closure" OR "maintenance" OR ` +
    `"traffic advisory" OR "scheduled closure" OR "diversion"` +
    `)`
  );
}

/**
 * Future VVIP / political query — advance security arrangements.
 */
export function futureVvipQuery(ctx: SegmentCtx): string {
  const g = geo(ctx);
  return (
    `"${g}" (` +
    `"VVIP visit" OR "PM visit" OR "CM visit" OR "President tour" OR ` +
    `"election rally" OR "political programme" OR "public meeting" OR ` +
    `"security arrangement" OR "advance notice" OR "traffic order"` +
    `)`
  );
}

/**
 * Returns ALL current query variants as an array.
 * The cron job can run them in parallel and merge/deduplicate results.
 */
export function allCurrentQueries(ctx: SegmentCtx): string[] {
  return [
    currentSearchQuery(ctx),
    currentWeatherQuery(ctx),
    currentVvipQuery(ctx),
    currentReligiousQuery(ctx),
    currentPoliticalQuery(ctx),
  ];
}

/**
 * Returns ALL future query variants as an array.
 */
export function allFutureQueries(ctx: SegmentCtx): string[] {
  return [
    futureSearchQuery(ctx),
    futureReligiousQuery(ctx),
    futureInfraQuery(ctx),
    futureVvipQuery(ctx),
  ];
}
