import Parser from 'rss-parser';
import { RSSItem } from '@/types';
import { buildGoogleNewsRSSUrl } from '@/lib/query-builder';
import { REQUEST_TIMEOUT_MS } from '@/lib/constants';

const parser = new Parser({
  timeout: REQUEST_TIMEOUT_MS,
  customFields: {
    item: ['media:content', 'media:thumbnail', 'description'],
  },
});

export async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map((item) => ({
      title: item.title || '',
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || null,
      description: item.contentSnippet || item.description || '',
      content: item.content || '',
    }));
  } catch (err) {
    console.warn(`RSS fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchGoogleNewsRSS(query: string): Promise<RSSItem[]> {
  const url = buildGoogleNewsRSSUrl(query);
  return fetchRSSFeed(url);
}

export async function fetchMultipleRSSFeeds(
  queries: string[],
  maxPerFeed = 10
): Promise<RSSItem[]> {
  const results = await Promise.allSettled(
    queries.map((q) => fetchGoogleNewsRSS(q))
  );

  const allItems: RSSItem[] = [];
  const seenUrls = new Set<string>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value.slice(0, maxPerFeed)) {
        if (item.link && !seenUrls.has(item.link)) {
          seenUrls.add(item.link);
          allItems.push(item);
        }
      }
    }
  }

  return allItems;
}
