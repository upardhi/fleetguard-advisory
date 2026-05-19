import { SearchQuery, IncidentCategory } from '@/types';
import { PAST_QUERY_TEMPLATES, FUTURE_QUERY_TEMPLATES, CATEGORY_KEYWORDS } from './constants';

export function buildSearchQueries(
  location: string,
  categories?: IncidentCategory[]
): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const loc = location.trim();

  // Only future/traffic queries - no past queries at all
  const currentDate = new Date();
  const monthYear = currentDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' }); // "May 2026"

  FUTURE_QUERY_TEMPLATES.forEach((template) => {
    // queries.push({ query: template.replace('{location}', loc), type: 'future' });
    queries.push({ query: `${template.replace('{location}', loc)} ${monthYear}`, type: 'future' });
  });

  // Category-specific only if traffic-related
  const TRAFFIC_CATS: IncidentCategory[] = [
    'bandh', 'morcha', 'rally', 'protest', 'vip_movement',
    'road_block', 'highway_blockage', 'religious_procession',
    'festival_crowd', 'election_rally',
  ];

  const targetCats = categories?.length ? categories.filter(c => TRAFFIC_CATS.includes(c)) : TRAFFIC_CATS;

  targetCats.forEach((cat) => {
    const keywords = CATEGORY_KEYWORDS[cat];
    if (keywords.length > 0) {
      queries.push({
        query: `
          ${loc}
          ${keywords[0]}
          India
          next 7 days
          upcoming
          scheduled
          traffic advisory
          `,
        type: 'future',
        category: cat,
      });
    }
  });

  // Deduplicate
  const seen = new Set<string>();
  return queries.filter((q) => {
    if (seen.has(q.query)) return false;
    seen.add(q.query);
    return true;
  });
}

export function buildGoogleNewsRSSUrl(query: string): string {
  const enhancedQuery = `${query} upcoming OR scheduled OR advisory OR tomorrow OR this week`;
  const encoded = encodeURIComponent(enhancedQuery);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;
}

export function buildGoogleSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query + ' site:timesofindia.com OR site:ndtv.com OR site:thehindu.com OR site:hindustantimes.com OR site:indiatimes.com');
  return `https://www.google.com/search?q=${encoded}&num=10&tbs=qdr:w`;
}
