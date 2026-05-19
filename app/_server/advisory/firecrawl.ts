/**
 * Firecrawl client — news search + page scraping.
 * Requires FIRECRAWL_API_KEY in the environment.
 * Docs: https://docs.firecrawl.dev
 */

import { isAllowedNewsUrl } from "@/lib/source-filter";

const API_BASE = "https://api.firecrawl.dev/v1";

function firecrawlKey(): string {
  const key = process.env.FIRECRAWL_API_KEY ?? "";
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return key;
}

export interface SearchHit {
  url: string;
  title: string;
  description: string;
}

interface FcSearchResponse {
  success?: boolean;
  data?: Array<{ url: string; title?: string; description?: string }>;
  error?: string;
}

/** Search the web for news matching `query`. Returns up to `limit` hits. */
export async function firecrawlSearch(query: string, limit = 20): Promise<SearchHit[]> {

  const enhancedQuery = `
${query}

(
  traffic restriction
  OR traffic advisory
  OR road closure
  OR protest
  OR morcha
  OR rally
  OR VIP movement
  OR CM visit
  OR PM visit
  OR strike
  OR public gathering
  OR congestion
  OR route diversion
  OR metro disruption
  OR railway maintenance
)

`;
  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify({
      query: enhancedQuery,
      limit,
      tbs: "qdr:w"
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl search HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FcSearchResponse;
  if (data.error) throw new Error(`Firecrawl search: ${data.error}`);
  return (data.data ?? [])
    .map((d) => ({
      url: d.url,
      title: d.title ?? "",
      description: d.description ?? "",
    }));
}

interface FcScrapeResponse {
  success?: boolean;
  data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
  error?: string;
}

export interface ScrapeResult {
  markdown: string;
  title: string;
}

/** Scrape a single page to markdown. */
export async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const res = await fetch(`${API_BASE}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl scrape HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FcScrapeResponse;
  if (data.error) throw new Error(`Firecrawl scrape: ${data.error}`);

  return {
    markdown: data.data?.markdown ?? "",
    title: data.data?.metadata?.title ?? "",
  };
}

export function hasFirecrawlKey(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}
