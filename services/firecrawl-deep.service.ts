import { ScrapedContent } from '@/types';
import { detectSourceType } from './firecrawl.service';

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/crawl';

interface CrawlResponse {
  success: boolean;
  data?: {
    pages?: Array<{
      url: string;
      markdown?: string;
      metadata?: {
        title?: string;
        publishedTime?: string;
        ogImage?: string;
      };
    }>;
  };
}

export async function crawlSource(
  url: string,
  maxPages = 5
): Promise<ScrapedContent[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) return [];

  try {
    const response = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        limit: maxPages,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
    });

    if (!response.ok) return [];

    const data: CrawlResponse = await response.json();

    if (!data.success || !data.data?.pages) {
      return [];
    }

    return data.data.pages.map((page) => ({
      url: page.url,
      title: page.metadata?.title || '',
      text: page.markdown || '',
      publishedAt: page.metadata?.publishedTime || null,
      images: page.metadata?.ogImage
        ? [page.metadata.ogImage]
        : [],
      sourceType: detectSourceType(page.url),
    }));
  } catch (err) {
    console.warn('Firecrawl crawl failed:', err);
    return [];
  }
}