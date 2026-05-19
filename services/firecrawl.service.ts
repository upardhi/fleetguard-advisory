import { ScrapedContent, SourceType } from '@/types';
import { SCRAPE_TIMEOUT_MS } from '@/lib/constants';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    content?: string;
    metadata?: {
      title?: string;
      description?: string;
      publishedTime?: string;
      ogImage?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

export async function scrapeWithFirecrawl(url: string): Promise<ScrapedContent | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    const response = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Firecrawl API returned ${response.status}`);
    }

    const data: FirecrawlResponse = await response.json();

    if (!data.success || !data.data) {
      return null;
    }

    const text = data.data.markdown || data.data.content || '';
    const meta = data.data.metadata || {};

    return {
      url,
      title: meta.title || '',
      text,
      publishedAt: meta.publishedTime || null,
      images: meta.ogImage ? [meta.ogImage] : [],
      sourceType: detectSourceType(url),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`Firecrawl timeout for ${url}`);
    } else {
      console.warn(`Firecrawl error for ${url}:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

export function detectSourceType(url: string): SourceType {
  const domain = url.toLowerCase();
  if (domain.includes('twitter.com') || domain.includes('x.com')) return 'social';
  if (domain.includes('facebook.com') || domain.includes('instagram.com')) return 'social';
  if (domain.includes('reddit.com') || domain.includes('telegram')) return 'social';
  if (domain.includes('youtube.com')) return 'social';
  if (domain.includes('indianrailways') || domain.includes('irctc') || domain.includes('metro')) return 'railway';
  if (domain.includes('.gov.in') || domain.includes('government') || domain.includes('police')) return 'government';
  if (domain.includes('traffic') || domain.includes('nhai')) return 'traffic';
  if (
    domain.includes('timesofindia') ||
    domain.includes('ndtv') ||
    domain.includes('hindustantimes') ||
    domain.includes('thehindu') ||
    domain.includes('indiatimes') ||
    domain.includes('news18') ||
    domain.includes('abplive') ||
    domain.includes('news.google')
  ) return 'news';
  if (domain.includes('rss') || domain.includes('feed')) return 'rss';
  return 'unknown';
}


export async function searchWithFirecrawl(query: string): Promise<ScrapedContent[]> {
  if (!process.env.FIRECRAWL_API_KEY) return [];

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const results: ScrapedContent[] = [];

    for (const item of data.data || []) {
      if (item.markdown && item.markdown.length > 100) {
        results.push({
          url: item.url || '',
          title: item.title || '',
          text: item.markdown.slice(0, 5000),
          publishedAt: item.publishedAt || null,
          images: [],
          sourceType: detectSourceType(item.url || ''),
        });
      }
    }
    return results;
  } catch (err) {
    console.warn('Firecrawl search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}