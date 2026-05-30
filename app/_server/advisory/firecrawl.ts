/**
 * Firecrawl client — news search + page scraping.
 * Requires FIRECRAWL_API_KEY in the environment.
 * Docs: https://docs.firecrawl.dev
 */

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

/** Search the web for CURRENT news (past 24 hours only).
 *  Deliberately narrow — we want events that are STILL HAPPENING, not
 *  concluded disruptions from 3–7 days ago. Ongoing multi-day events
 *  (floods, strikes) will still appear in today's news feeds. */
export async function firecrawlSearch(query: string, limit = 5): Promise<SearchHit[]> {
  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify({ query, limit, tbs: "qdr:d" }), // qdr:d = past 24 hours only
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl search HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FcSearchResponse;
  if (data.error) throw new Error(`Firecrawl search: ${data.error}`);

  return (data.data ?? []).map((d) => ({
    url: d.url,
    title: d.title ?? "",
    description: d.description ?? "",
  }));
}

interface FcScrapeResponse {
  success?: boolean;
  data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string }, extract?: { content?: string; date?: string } };
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
    body: JSON.stringify({
      url,
      formats: ["extract"],
      extract: {
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            date: { type: "string" }
          },
          required: ["title", "content"]
        }
      }
    }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl scrape HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FcScrapeResponse;
  if (data.error) throw new Error(`Firecrawl scrape: ${data.error}`);

  return {
    markdown: `${data.data?.extract?.content} published on ${data.data?.extract?.date}`,
    title: data.data?.metadata?.title ?? "",
  };
}

/** Search for FUTURE / UPCOMING events — no date restriction. */
export async function firecrawlSearchFuture(query: string, limit = 3): Promise<SearchHit[]> {
  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey()}`,
    },
    body: JSON.stringify({ query, limit }), // no tbs — we want upcoming announcements too
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl future-search HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FcSearchResponse;
  if (data.error) throw new Error(`Firecrawl future-search: ${data.error}`);

  return (data.data ?? []).map((d) => ({
    url: d.url,
    title: d.title ?? "",
    description: d.description ?? "",
  }));
}

export function hasFirecrawlKey(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}
