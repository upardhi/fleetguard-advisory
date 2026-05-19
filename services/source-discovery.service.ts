import { searchWithFirecrawl } from './firecrawl.service';

const SOCIAL_DOMAINS = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'reddit.com',
  'youtube.com',
  't.me',
];

const NEWS_DOMAINS = [
  'timesofindia.indiatimes.com',
  'ndtv.com',
  'hindustantimes.com',
  'thehindu.com',
  'indianexpress.com',
  'news18.com',
  'abplive.com',
];

export async function discoverSources(
  queries: string[],
  limit = 40
): Promise<string[]> {
  const urls = new Set<string>();

  for (const query of queries.slice(0, 10)) {
    const enhancedQueries = [
      query,

      `${query} site:twitter.com`,
      `${query} site:x.com`,

      `${query} site:facebook.com`,
      `${query} site:instagram.com`,

      `${query} site:reddit.com`,
      `${query} site:t.me`,

      `${query} traffic advisory`,
      `${query} road closure`,
      `${query} protest`,
      `${query} rally`,
    ];

    for (const q of enhancedQueries) {
      const results = await searchWithFirecrawl(q);

      for (const item of results) {
        if (!item.url) continue;

        urls.add(item.url);

        if (urls.size >= limit) {
          return Array.from(urls);
        }
      }
    }
  }

  return Array.from(urls);
}