import { SearchQuery, IncidentCategory } from '@/types';
import { PAST_QUERY_TEMPLATES, FUTURE_QUERY_TEMPLATES, CATEGORY_KEYWORDS } from './constants';

export function buildSearchQueries(
  location: string,
  categories?: IncidentCategory[]
): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const loc = location.trim();

  // Past/current queries
  const pastTemplates = PAST_QUERY_TEMPLATES;
  pastTemplates.forEach((template) => {
    const query = template.replace('{location}', loc);
    queries.push({ query, type: 'past' });
  });

  // Future queries
  const futureTemplates = FUTURE_QUERY_TEMPLATES;
  futureTemplates.forEach((template) => {
    const query = template.replace('{location}', loc);
    queries.push({ query, type: 'future' });
  });

  // Category-specific queries
  if (categories && categories.length > 0) {
    categories.forEach((cat) => {
      const keywords = CATEGORY_KEYWORDS[cat];
      if (keywords.length > 0) {
        const kw = keywords[0];
        queries.push({
          query: `${loc} ${kw} latest`,
          type: 'past',
          category: cat,
        });
        queries.push({
          query: `${loc} ${kw} this week OR tomorrow OR upcoming OR scheduled`,
          type: 'future',
          category: cat,
        });
      }
    });
  }

  queries.push({
    query: `${loc} traffic restrictions`,
    type: 'future',
  });

  queries.push({
    query: `${loc} route diversion`,
    type: 'future',
  });

  queries.push({
    query: `${loc} police advisory`,
    type: 'future',
  });

  queries.push({
    query: `${loc} avoid travel`,
    type: 'future',
  });

  queries.push({
    query: `${loc} congestion expected`,
    type: 'future',
  });

  queries.push({
    query: `${loc} CM visit`,
    type: 'future',
  });

  queries.push({
    query: `${loc} PM visit`,
    type: 'future',
  });

  queries.push({
    query: `${loc} minister visit`,
    type: 'future',
  });

  queries.push({
    query: `${loc} VIP movement`,
    type: 'future',
  });

  queries.push({
    query: `${loc} convoy movement`,
    type: 'future',
  });

  queries.push({
    query: `${loc} मोर्चा`,
    type: 'future',
  });

  queries.push({
    query: `${loc} यात्रा`,
    type: 'future',
  });

  queries.push({
    query: `${loc} बंद`,
    type: 'future',
  });

  queries.push({
    query: `${loc} सभा`,
    type: 'future',
  });

  // Remove duplicates
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
