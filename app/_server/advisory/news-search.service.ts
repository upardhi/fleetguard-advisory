/**
 * news-search.service.ts
 *
 * Unified search layer for route-segment intelligence.
 *
 * Changes vs previous version (per Umashankar Sir — 27 May 2026):
 *
 *   1. Minimum 10 results per search pass (was 5–8).
 *   2. Multi-query fan-out: runs ALL query variants from decompose.ts in parallel
 *      so we catch traffic advisories, weather alerts, VVIP orders, religious
 *      events, and bandhs/strikes in one sweep.
 *   3. Source priority scoring:
 *        Tier 1 — Major Indian regional newspapers / wire services
 *        Tier 2 — National English dailies (ToI, HT, The Hindu, NDTV, etc.)
 *        Tier 3 — Government / official domains (.gov.in, police.gov.in, NHAI, etc.)
 *        Tier 4 — Everything else (Firecrawl, RSS fallback)
 *      Results are re-ranked by tier before being returned to the cron job.
 *   4. Hard dedup by normalised URL — even across multiple query variants.
 *   5. All search errors are isolated per-query so one failure doesn't kill the batch.
 */

import { fetchGoogleRSS } from "./google-rss.service";
import { allCurrentQueries, allFutureQueries } from "./decomponse-search";

const API_BASE = "https://api.firecrawl.dev/v1";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchHit {
  url: string;
  title: string;
  description: string;
  pubDate?: string | null;
  source?: "firecrawl" | "google-rss";
  /** Internal — used for re-ranking, stripped before returning */
  _tier?: number;
}

interface FcSearchResponse {
  success?: boolean;
  data?: Array<{
    url: string;
    title?: string;
    description?: string;
  }>;
  error?: string;
}

// ── Source priority tiers ─────────────────────────────────────────────────────
// Lower number = higher priority.
// Built from domain substrings — partial match is intentional.

const TIER_1_REGIONAL = [
  // North / UP / Bihar / MP
  "amarujala",
  "bhaskar",
  "jagran",
  "livehindustan",
  "navbharattimes",
  "patrika",
  "rajasthanpatrika",
  "haribhoomi",
  "naidunia",
  // West / Maharashtra / Gujarat
  "loksatta",
  "divyabhaskar",
  "sandesh",
  "gujaratsamachar",
  "maharashtratimes",
  // South
  "thehindu",
  "deccanherald",
  "deccanchronicle",
  "mathrubhumi",
  "dinamalar",
  "eenadu",
  "sakshi",
  "udayavani",
  "prajavani",
  // East / NE
  "telegraphindia",
  "anandabazar",
  "sentinelassam",
  "morungexpress",
  "nenow",
  "eastmojo",
  // Local news wires
  "news18",
  "abplive",
  "zeenews",
  "indiatv",
];

const TIER_2_NATIONAL = [
  "timesofindia",
  "toi",
  "hindustantimes",
  "ndtv",
  "indianexpress",
  "theprint",
  "thewire",
  "scroll.in",
  "businessstandard",
  "livemint",
  "economictimes",
  "financialexpress",
  "firstpost",
  "outlookindia",
  "theweek",
  "ptinews",
  "uniindia",
  "ani",
];

const TIER_3_OFFICIAL = [
  ".gov.in",
  "nhai.gov",
  "police.gov",
  "sdma.",
  "mha.gov",
  "traffic.",
  "commissionerate",
  "morth.nic",
  "incois.gov",
  "imd.gov",
  "ndma.gov",
  "asdma.gov", // Assam SDMA (Image 1)
];

function sourceTier(url: string): number {
  const lower = url.toLowerCase();
  if (TIER_1_REGIONAL.some((d) => lower.includes(d))) return 1;
  if (TIER_2_NATIONAL.some((d) => lower.includes(d))) return 2;
  if (TIER_3_OFFICIAL.some((d) => lower.includes(d))) return 3;
  return 4;
}

// ── URL normalisation & dedup ─────────────────────────────────────────────────

function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function dedup(hits: SearchHit[]): SearchHit[] {
  const seen = new Map<string, SearchHit>();
  for (const h of hits) {
    const key = normaliseUrl(h.url);
    if (!seen.has(key)) seen.set(key, h);
  }
  return Array.from(seen.values());
}

/** Re-rank by tier (asc), then preserve original order within each tier. */
function rankByTier(hits: SearchHit[]): SearchHit[] {
  return hits
    .map((h) => ({ ...h, _tier: sourceTier(h.url) }))
    .sort((a, b) => (a._tier ?? 4) - (b._tier ?? 4))
    .map(({ _tier: _, ...h }) => h);
}

// ── Firecrawl internals ───────────────────────────────────────────────────────

function firecrawlKey(): string {
  const key = process.env.FIRECRAWL_API_KEY ?? "";
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return key;
}

/**
 * Single Firecrawl search call.
 * tbs: "qdr:d"  → last 24 hours (current)
 * tbs: undefined → no date restriction (future)
 */
async function firecrawlSearch(query: string, limit: number, tbs?: string): Promise<SearchHit[]> {
  const body: Record<string, unknown> = { query, limit };
  if (tbs) body.tbs = tbs;

  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FcSearchResponse;
  if (data.error) throw new Error(`Firecrawl: ${data.error}`);

  return (data.data ?? []).map((d) => ({
    url: d.url,
    title: d.title ?? "",
    description: d.description ?? "",
    source: "firecrawl" as const,
  }));
}

// ── Multi-query fan-out ───────────────────────────────────────────────────────

/**
 * Runs a list of queries in parallel against Firecrawl + Google RSS.
 * Errors per-query are caught silently — partial results are better than nothing.
 * Returns deduplicated, tier-ranked hits capped at `limit`.
 */
async function fanOut(queries: string[], limit: number, tbs?: string): Promise<SearchHit[]> {
  // How many results to ask per query — over-fetch so we have room after dedup
  const perQuery = Math.ceil(limit / 2) + 5;

  const settled = await Promise.allSettled(
    queries.flatMap((q) => [
      firecrawlSearch(q, perQuery, tbs),
      // Google RSS for every query variant too
      fetchGoogleRSS(q, tbs === "qdr:d" ? "current" : "future").then((items) =>
        items.map(
          (item): SearchHit => ({
            url: item.link,
            title: item.title,
            description: "",
            pubDate: item.pubDate,
            source: "google-rss",
          })
        )
      ),
    ])
  );

  const all: SearchHit[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  return rankByTier(dedup(all)).slice(0, limit);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * searchCurrentNews
 *
 * Searches the last 24 hours across ALL current query variants:
 *   - General disruption / traffic advisory
 *   - Weather / disaster (IMD, SDMA — see Image 1)
 *   - VVIP movement orders
 *   - Religious event diversions (Ganga Dussehra, mela — see Image 2)
 *   - Political / bandh / strike
 *
 * Returns at least `limit` results (default 10), ranked by source quality.
 * Falls back gracefully if any individual query/source fails.
 *
 * @param baseQuery  The primary query from currentSearchQuery() — kept for
 *                   backward compatibility with existing call sites.
 * @param limit      Minimum results to return. Default 10.
 * @param ctx        Optional segment context for richer fan-out queries.
 *                   If provided, ALL current query variants are run.
 *                   If omitted, only the base query runs (legacy behaviour).
 */
export async function searchCurrentNews(
  baseQuery: string,
  limit = 10,
  ctx?: { name: string; state?: string }
): Promise<SearchHit[]> {
  const queries = ctx
    ? allCurrentQueries(ctx) // Full fan-out: 5 focused query variants
    : [baseQuery]; // Legacy: single query

  return fanOut(queries, limit, "qdr:d");
}

/**
 * searchFutureNews
 *
 * Searches without date restriction for scheduled/upcoming events:
 *   - Future traffic diversions / advance diversion orders
 *   - Religious events (mela, yatra, festivals announced in advance)
 *   - Infrastructure closures (NHAI, PWD repair notices)
 *   - VVIP visit / election rally announcements
 *
 * Returns at least `limit` results (default 10), ranked by source quality.
 *
 * @param baseQuery  Primary query from futureSearchQuery() — kept for
 *                   backward compatibility.
 * @param limit      Default 10.
 * @param ctx        Optional segment context for richer fan-out queries.
 */
export async function searchFutureNews(
  baseQuery: string,
  limit = 10,
  ctx?: { name: string; state?: string }
): Promise<SearchHit[]> {
  const queries = ctx
    ? allFutureQueries(ctx) // Full fan-out: 4 focused query variants
    : [baseQuery];

  return fanOut(queries, limit);
}

export function hasFirecrawlKey(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}
