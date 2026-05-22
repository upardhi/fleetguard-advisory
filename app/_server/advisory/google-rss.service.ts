import Parser from 'rss-parser';
import { resolveGoogleNewsUrl } from './google-news-decoder.service';

const parser = new Parser();

export interface RSSNewsItem {
  title: string;
  link: string;
  pubDate: string | null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWithinDays(
  pubDate: string | null,
  days: number
): boolean {

  if (!pubDate) return false;

  const ts = new Date(pubDate).getTime();

  if (isNaN(ts)) return false;

  const diff =
    Date.now() - ts;

  return diff <= days * 24 * 60 * 60 * 1000;
}

export async function fetchGoogleRSS(
  query: string,
  mode: 'current' | 'future' = 'current'
): Promise<RSSNewsItem[]> {

  // CURRENT:
  // last 2 days only
  //
  // FUTURE:
  // allow older advisory articles
  // because they may discuss upcoming disruptions

  const searchQuery =
    mode === 'current'
      ? `${query} when:2d`
      : `${query} (upcoming OR scheduled OR advisory OR traffic OR diversion OR protest OR rally OR bandh OR yatra OR closure)`;
      
  const encoded =
    encodeURIComponent(searchQuery);

  const rssUrl =
    `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;

  const feed =
    await parser.parseURL(rssUrl);

  const items =
    feed.items || [];

  // Deduplicate by normalized title
  // Keep latest article only

  const latestByTitle =
    new Map<string, RSSNewsItem>();

  for (const item of items) {

    const title =
      item.title || '';

    const normalized =
      normalizeTitle(title);

    const existing =
      latestByTitle.get(normalized);

    const currentDate =
      item.pubDate
        ? new Date(item.pubDate).getTime()
        : 0;

    const existingDate =
      existing?.pubDate
        ? new Date(existing.pubDate).getTime()
        : 0;

    // CURRENT MODE:
    // only recent news

    if (
      mode === 'current' &&
      !isWithinDays(item.pubDate || null, 2)
    ) {
      continue;
    }

    // FUTURE MODE:
    // allow older articles
    // BUT ignore articles older than 30d

    if (
      mode === 'future' &&
      !isWithinDays(item.pubDate || null, 30)
    ) {
      continue;
    }

    // Keep latest duplicate

    if (
      !existing ||
      currentDate > existingDate
    ) {

      const rawUrl =
        item.link || '';

      let finalUrl = rawUrl;

      try {
        finalUrl =
          await resolveGoogleNewsUrl(
            rawUrl
          );
      } catch { }

      latestByTitle.set(normalized, {
        title,
        link: finalUrl,
        pubDate:
          item.pubDate || null,
      });
    }
  }

  return Array.from(
    latestByTitle.values()
  );
}