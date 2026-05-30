import {
  fetchGoogleRSS,
} from "./google-rss.service";

/**
 * Firecrawl client — news search + page scraping.
 * Firecrawl = primary source
 * Google RSS = secondary/fallback source
 */

const API_BASE =
  "https://api.firecrawl.dev/v1";

function firecrawlKey(): string {

  const key =
    process.env.FIRECRAWL_API_KEY ?? "";

  if (!key) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set"
    );
  }

  return key;
}

export interface SearchHit {
  url: string;
  title: string;
  description: string;
  pubDate?: string | null;
  source?:
  | "firecrawl"
  | "google-rss";
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

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function normalizeText(
  value: string
): string {

  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(
  url: string
): string {

  try {

    const u =
      new URL(url);

    return `${u.hostname}${u.pathname}`
      .replace(/\/$/, "")
      .toLowerCase();

  } catch {

    return url.toLowerCase();
  }
}

function dedupeResults(
  results: SearchHit[]
): SearchHit[] {

  const map =
    new Map<string, SearchHit>();

  for (const item of results) {

    const key =
      normalizeUrl(item.url) ||
      normalizeText(item.title);

    /**
     * First item wins
     * Firecrawl automatically wins
     * because we insert it first
     */

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(
    map.values()
  );
}

/* -------------------------------------------------------------------------- */
/*                            FIRECRAWL INTERNALS                             */
/* -------------------------------------------------------------------------- */

/**
 * CURRENT NEWS
 * Last 24 hours
 */

async function firecrawlCurrentSearch(
  query: string,
  limit = 5
): Promise<SearchHit[]> {

  const res = await fetch(
    `${API_BASE}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${firecrawlKey()}`,
      },
      body: JSON.stringify({
        query,
        limit,
        sources: ["news"],
        tbs: "qdr:d",
      }),
    }
  );

  if (!res.ok) {

    const text =
      await res.text();

    throw new Error(
      `Firecrawl current-search HTTP ${res.status}: ${text.slice(0, 200)}`
    );
  }

  const data =
    (await res.json()) as FcSearchResponse;

  if (data.error) {
    throw new Error(
      `Firecrawl current-search: ${data.error}`
    );
  }

  return (data.data ?? []).map(
    (d) => ({
      url: d.url,
      title: d.title ?? "",
      description:
        d.description ?? "",
      source: "firecrawl",
    })
  );
}

/**
 * FUTURE / UPCOMING EVENTS
 * No date restriction
 */

async function firecrawlFutureSearch(
  query: string,
  limit = 5
): Promise<SearchHit[]> {

  const futureQuery =
    `${query} upcoming OR scheduled OR advisory OR traffic OR diversion OR protest OR rally OR bandh OR yatra OR closure`;

  const res = await fetch(
    `${API_BASE}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${firecrawlKey()}`,
      },
      body: JSON.stringify({
        query: futureQuery,
        limit,
        sources: ["news"],

      }),
    }
  );

  if (!res.ok) {

    const text =
      await res.text();

    throw new Error(
      `Firecrawl future-search HTTP ${res.status}: ${text.slice(0, 200)}`
    );
  }

  const data =
    (await res.json()) as FcSearchResponse;

  if (data.error) {
    throw new Error(
      `Firecrawl future-search: ${data.error}`
    );
  }

  return (data.data ?? []).map(
    (d) => ({
      url: d.url,
      title: d.title ?? "",
      description:
        d.description ?? "",
      source: "firecrawl",
    })
  );
}

/* -------------------------------------------------------------------------- */
/*                          UNIFIED CURRENT SEARCH                            */
/* -------------------------------------------------------------------------- */

/**
 * Current disruptions/news
 *
 * Sources:
 * 1. Firecrawl (priority)
 * 2. Google RSS
 */

export async function searchCurrentNews(
  query: string,
  limit = 8
): Promise<SearchHit[]> {

  const [
    firecrawlResult,
    rssResult,
  ] = await Promise.allSettled([
    firecrawlCurrentSearch(
      query,
      limit
    ),
    fetchGoogleRSS(
      query,
      "current"
    ),
  ]);

  const firecrawlHits =
    firecrawlResult.status ===
      "fulfilled"
      ? firecrawlResult.value
      : [];

  const rssHits =
    rssResult.status ===
      "fulfilled"
      ? rssResult.value.map(
        (item) => ({
          url: item.link,
          title: item.title,
          description: "",
          pubDate:
            item.pubDate,
          source:
            "google-rss" as const,
        })
      )
      : [];

  const merged =
    dedupeResults([
      ...firecrawlHits,
      ...rssHits,
    ]);

  return merged.slice(
    0,
    limit
  );
}

/* -------------------------------------------------------------------------- */
/*                           UNIFIED FUTURE SEARCH                            */
/* -------------------------------------------------------------------------- */

/**
 * Future / upcoming disruptions
 *
 * Sources:
 * 1. Firecrawl (priority)
 * 2. Google RSS
 */

export async function searchFutureNews(
  query: string,
  limit = 8
): Promise<SearchHit[]> {

  const [
    firecrawlResult,
    rssResult,
  ] = await Promise.allSettled([
    firecrawlFutureSearch(
      query,
      limit
    ),
    fetchGoogleRSS(
      query,
      "future"
    ),
  ]);

  const firecrawlHits =
    firecrawlResult.status ===
      "fulfilled"
      ? firecrawlResult.value
      : [];

  const rssHits =
    rssResult.status ===
      "fulfilled"
      ? rssResult.value.map(
        (item) => ({
          url: item.link,
          title: item.title,
          description: "",
          pubDate:
            item.pubDate,
          source:
            "google-rss" as const,
        })
      )
      : [];

  const merged =
    dedupeResults([
      ...firecrawlHits,
      ...rssHits,
    ]);

  return merged.slice(
    0,
    limit
  );
}

/* -------------------------------------------------------------------------- */
/*                               PAGE SCRAPING                                */
/* -------------------------------------------------------------------------- */

interface FcScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

export interface ScrapeResult {
  markdown: string;
  title: string;
}

export async function firecrawlScrape(
  url: string
): Promise<ScrapeResult> {

  const res = await fetch(
    `${API_BASE}/scrape`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${firecrawlKey()}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    }
  );

  if (!res.ok) {

    const text =
      await res.text();

    throw new Error(
      `Firecrawl scrape HTTP ${res.status}: ${text.slice(0, 200)}`
    );
  }

  const data =
    (await res.json()) as FcScrapeResponse;

  if (data.error) {
    throw new Error(
      `Firecrawl scrape: ${data.error}`
    );
  }

  return {
    markdown:
      data.data?.markdown ?? "",
    title:
      data.data?.metadata?.title ??
      "",
  };
}

export function hasFirecrawlKey(): boolean {

  return Boolean(
    process.env.FIRECRAWL_API_KEY
  );
}