import * as cheerio from 'cheerio';
import { ScrapedContent } from '@/types';
import { httpClient } from '@/lib/axios';
import { detectSourceType } from './firecrawl.service';
import { MAX_PARALLEL_SCRAPES, SCRAPE_TIMEOUT_MS } from '@/lib/constants';
import { firecrawlScrape } from '@/app/_server/advisory/firecrawl';
import { fetchGoogleRSS } from './google-rss.service';
import { resolveGoogleNewsUrl } from './google-news-decoder.service';
import { discoverSources } from './source-discovery.service';
import { crawlSource } from './firecrawl-deep.service';

const SCRAPER_BASE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';


// ── Core fetch helper ─────────────────────────────────────────────────────────

async function callScraper<T>(endpoint: string, body: object): Promise<T | null> {
  try {
    const res = await fetch(`${SCRAPER_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`[scraper-service] ${endpoint} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  const result = await callScraper<ScrapedContent>('/scrape', { url });
  return result;
}

export async function scrapeUrlsBatch(urls: string[]): Promise<ScrapedContent[]> {
  if (!urls.length) return [];
  const unique = Array.from(new Set(urls)).slice(0, MAX_PARALLEL_SCRAPES * 4);

  const result = await callScraper<ScrapedContent[]>('/scrape-batch', {
    urls: unique,
    max_concurrent: MAX_PARALLEL_SCRAPES,
  });

  return result ?? [];
}


export async function scrapeWithCheerio(url: string): Promise<ScrapedContent | null> {
  try {
    const response = await httpClient.get(url, {
      timeout: SCRAPE_TIMEOUT_MS,
      responseType: 'text',
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Remove noise
    $('script, style, nav, footer, header, aside, .advertisement, .ads, .cookie').remove();

    // Extract title
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text() ||
      $('h1').first().text() ||
      '';

    // Extract published time
    const publishedAt =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publishdate"]').attr('content') ||
      $('time').first().attr('datetime') ||
      null;

    // Extract main content
    const contentSelectors = [
      'article',
      '[class*="article-body"]',
      '[class*="story-body"]',
      '[class*="content-body"]',
      '[class*="post-content"]',
      'main',
      '.content',
    ];

    let text = '';
    for (const sel of contentSelectors) {
      const el = $(sel);
      if (el.length > 0) {
        text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 200) break;
      }
    }

    if (!text) {
      text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
    }

    // Extract images
    const images: string[] = [];
    $('meta[property="og:image"]').each((_, el) => {
      const src = $(el).attr('content');
      if (src) images.push(src);
    });
    $('article img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http') && !images.includes(src)) images.push(src);
    });

    return {
      url,
      title: title.trim(),
      text: text.slice(0, 5000),
      publishedAt,
      images: images.slice(0, 5),
      sourceType: detectSourceType(url),
    };
  } catch (err) {
    console.warn(`Cheerio scrape failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const TRAFFIC_TITLE_KEYWORDS = [
  'traffic', 'jam', 'block', 'diversion', 'route', 'road closed',
  'advisory', 'bandh', 'morcha', 'protest', 'rally', 'procession',
  'yatra', 'vip', 'convoy', 'pm visit', 'cm visit', 'minister visit',
  'strike', 'agitation', 'shutdown', 'curfew', 'march', 'gathering',
  'जाम', 'बंद', 'मोर्चा', 'यात्रा', 'रैली', 'आंदोलन',
];

function isTitleTrafficRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return TRAFFIC_TITLE_KEYWORDS.some((kw) => lower.includes(kw));
}

function isLocationRelevant(title: string, location: string): boolean {
  const lower = title.toLowerCase();
  const parts = location.toLowerCase().split(/[\s,]+/).filter((p) => p.length > 2);
  return parts.some((part) => lower.includes(part));
}

function isWithin7Days(pubDate: string | null): boolean {
  if (!pubDate) return false;
  const pub = new Date(pubDate).getTime();
  if (isNaN(pub)) return false;
  const now = Date.now();
  const PAST_48H = 48 * 60 * 60 * 1000;
  const FUTURE_7D = 7 * 24 * 60 * 60 * 1000;
  return pub >= now - PAST_48H && pub <= now + FUTURE_7D;
}

export async function searchAndScrapeIncidents(
  queries: string[],
  location: string,
  maxUrls = 40,
): Promise<ScrapedContent[]> {

  const results: ScrapedContent[] = [];
  
  // STEP 1 — RSS DISCOVERY
  const rssUrls = new Set<string>();

  for (const query of queries.slice(0, 8)) {
    try {
      const items = await fetchGoogleRSS(query);

      for (const item of items) {
        if (!item.link) continue;

        if (!isWithin7Days(item.pubDate)) continue;

        if (!isLocationRelevant(item.title, location)) continue;

        if (!isTitleTrafficRelevant(item.title)) continue;

        rssUrls.add(item.link);

        if (rssUrls.size >= 20) break;
      }
    } catch (err) {
      console.warn('RSS failed:', err);
    }
  }

  // STEP 2 — SOCIAL + WEB DISCOVERY
  const discoveredUrls = await discoverSources(
    queries,
    20
  );
  
  const allUrls = Array.from(
    new Set([
      ...Array.from(rssUrls),
      ...discoveredUrls,
    ])
  ).slice(0, maxUrls);

  // STEP 3 — SCRAPE EVERYTHING
  await Promise.all(
    allUrls.map(async (url) => {
      try {
        const isSocial =
          detectSourceType(url) === 'social';

        if (isSocial) {
          const pages = await crawlSource(url, 5);

          results.push(...pages);
        } else {
          const finalUrl = await resolveGoogleNewsUrl(url);

          const scraped = await scrapeUrl(finalUrl);

          if (scraped) {
            results.push(scraped);
          }
        }
      } catch (err) {
        console.warn('scrape failed', url);
      }
    })
  );

  return results;
}