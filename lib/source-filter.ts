import { INDIAN_NEWS_SOURCES } from './news-sources';

export function isAllowedNewsUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');

    return INDIAN_NEWS_SOURCES.some((domain) =>
      hostname.includes(domain)
    );
  } catch {
    return false;
  }
}