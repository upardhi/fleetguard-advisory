import { NextRequest, NextResponse } from 'next/server';
import { IncidentSearchRequest, IncidentSearchResponse, Incident } from '@/types';
import { buildSearchQueries } from '@/lib/query-builder';
import { fetchMultipleRSSFeeds } from '@/services/rss.service';
import { scrapeUrlsBatch } from '@/services/scraper.service';
import {
  parseIncidentFromScrapedContent,
  parseIncidentFromRSSItem,
} from '@/services/incident-parser.service';
import { deduplicateIncidents, filterByRelevance } from '@/services/dedupe.service';
import { sortIncidentsByTime } from '@/services/timeline.service';
import { MAX_ARTICLES_TO_SCRAPE } from '@/lib/constants';

// Simple in-memory cache
const cache = new Map<string, { data: IncidentSearchResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: IncidentSearchRequest = await req.json();

    const {
      location,
      radiusKm = 50,
      pastHours = 48,
      futureHours = 168,
      categories = [],
    } = body;

    if (!location || typeof location !== 'string' || location.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Invalid location provided' },
        { status: 400 }
      );
    }

    const cacheKey = `${location.toLowerCase()}-${pastHours}-${futureHours}-${categories.join(',')}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    // Generate search queries
    const queries = buildSearchQueries(location.trim(), categories);
    const pastQueries = queries.filter((q) => q.type === 'past').map((q) => q.query);
    const futureQueries = queries.filter((q) => q.type === 'future').map((q) => q.query);

    // Fetch RSS feeds in parallel
    const [pastRSSItems, futureRSSItems] = await Promise.all([
      fetchMultipleRSSFeeds(pastQueries.slice(0, 8), 8),
      fetchMultipleRSSFeeds(futureQueries.slice(0, 20), 10)
    ]);

    // Collect URLs for scraping
    const pastUrls = pastRSSItems.map((i) => i.link).filter(Boolean);
    const futureUrls = futureRSSItems.map((i) => i.link).filter(Boolean);
    debugger;
    // Scrape in batches (limit total articles)
    const maxPastScrape = Math.floor(MAX_ARTICLES_TO_SCRAPE * 0.6);
    const maxFutureScrape = Math.floor(MAX_ARTICLES_TO_SCRAPE * 0.4);

    const [pastScraped, futureScraped] = await Promise.all([
      scrapeUrlsBatch(pastUrls.slice(0, maxPastScrape)),
      scrapeUrlsBatch(futureUrls.slice(0, maxFutureScrape)),
    ]);

    // Parse incidents
    const allIncidents: Incident[] = [];

    // From RSS items (quick parse without full scrape)
    for (const item of pastRSSItems) {
      const incident = await parseIncidentFromRSSItem(item, location, pastHours, futureHours, 'past');
      if (incident) allIncidents.push(incident);
    }

    for (const item of futureRSSItems) {
      const incident = await parseIncidentFromRSSItem(item, location, pastHours, futureHours, 'future');
      if (incident) allIncidents.push(incident);
    }

    // From scraped content (more detailed)
    for (const content of pastScraped) {
      const incident = await parseIncidentFromScrapedContent(
        content,
        location,
        pastHours,
        futureHours,
        'past'
      );
      if (incident) allIncidents.push(incident);
    }
    debugger;
    for (const content of futureScraped) {
      const incident = await parseIncidentFromScrapedContent(
        content,
        location,
        pastHours,
        futureHours,
        'future'
      );
      if (incident) allIncidents.push(incident);
    }

    // Filter by relevance to location
    const relevant = filterByRelevance(allIncidents, location);

    // Deduplicate
    const deduped = deduplicateIncidents(relevant);

    // Sort by time/severity
    const sorted = sortIncidentsByTime(deduped);

    const response: IncidentSearchResponse = {
      success: true,
      totalIncidents: sorted.length,
      generatedAt: new Date().toISOString(),
      location: location.trim(),
      timeWindow: { pastHours, futureHours },
      incidents: sorted,
      queryCount: queries.length,
      sourceCount: pastRSSItems.length + futureRSSItems.length,
    };

    // Cache result
    cache.set(cacheKey, { data: response, timestamp: Date.now() });

    // Clean old cache entries
    for (const [key, value] of Array.from(cache.entries())) {
      if (Date.now() - value.timestamp > CACHE_TTL_MS * 2) {
        cache.delete(key);
      }
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Incidents API error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error. Please try again.',
        totalIncidents: 0,
        incidents: [],
        generatedAt: new Date().toISOString(),
        location: '',
        timeWindow: { pastHours: 48, futureHours: 48 },
      } satisfies IncidentSearchResponse,
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'India Incident Intelligence API',
    version: '1.0.0',
    endpoints: {
      'POST /api/incidents': 'Search incidents by location',
    },
    supportedCategories: [
      'flood', 'heavy_rain', 'protest', 'bandh', 'accident',
      'traffic_jam', 'fire', 'train_delay', 'landslide', 'cyclone',
    ],
  });
}
