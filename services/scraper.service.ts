import * as cheerio from 'cheerio';
import { ScrapedContent } from '@/types';
import { httpClient } from '@/lib/axios';
import { detectSourceType } from './firecrawl.service';
import { scrapeWithFirecrawl } from './firecrawl.service';
import { MAX_PARALLEL_SCRAPES, SCRAPE_TIMEOUT_MS } from '@/lib/constants';

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

export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  // Try Firecrawl first if API key is available
  if (process.env.FIRECRAWL_API_KEY) {
    const firecrawlResult = await scrapeWithFirecrawl(url);
    if (firecrawlResult && firecrawlResult.text.length > 100) {
      return firecrawlResult;
    }
  }
  // Fallback to Cheerio
  return scrapeWithCheerio(url);
}

export async function scrapeUrlsBatch(urls: string[]): Promise<ScrapedContent[]> {
  const uniqueUrls = Array.from(new Set(urls)).slice(0, MAX_PARALLEL_SCRAPES * 4);
  const results: ScrapedContent[] = [];
debugger;
  // Process in batches of MAX_PARALLEL_SCRAPES
  for (let i = 0; i < uniqueUrls.length; i += MAX_PARALLEL_SCRAPES) {
    const batch = uniqueUrls.slice(i, i + MAX_PARALLEL_SCRAPES);
    const batchResults = await Promise.allSettled(batch.map((url) => scrapeUrl(url)));

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + MAX_PARALLEL_SCRAPES < uniqueUrls.length) {
      await new Promise((res) => setTimeout(res, 300));
    }
  }

  return results;
}
