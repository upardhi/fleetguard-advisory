import { NextRequest, NextResponse } from 'next/server';
import { IncidentSearchRequest, IncidentSearchResponse, Incident } from '@/types';
import { buildSearchQueries } from '@/lib/query-builder';
import { parseIncidentFromScrapedContent } from '@/services/incident-parser.service';
import { deduplicateIncidents } from '@/services/dedupe.service';
import { sortIncidentsByTime } from '@/services/timeline.service';
import { searchAndScrapeIncidents } from '@/services/scraper.service';
import { saveTrafficNews } from '@/services/database/incident-db.service';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: IncidentSearchRequest = await req.json();
    const { location, pastHours = 48, futureHours = 168, categories = [] } = body;

    if (!location || typeof location !== 'string' || location.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Invalid location provided' },
        { status: 400 }
      );
    }

    const queries = buildSearchQueries(location.trim(), categories);
    const futureQueries = queries.map((q) => q.query);
    // Python scraper: fetches RSS + scrapes articles, filters to next 7 days
    const scrapedArticles = await searchAndScrapeIncidents(
      futureQueries.slice(0, 8),
      location,
      30,
    );
    const allIncidents: Incident[] = [];
    for (const content of scrapedArticles) {
      const incident = await parseIncidentFromScrapedContent(
        content, location, 0, futureHours, 'future'
      );

      if (incident) allIncidents.push(incident);
    }

    const deduped = deduplicateIncidents(allIncidents);
    const sorted = sortIncidentsByTime(deduped);

    // saveTrafficNews(sorted)
    //   .catch(console.error);

    const response: IncidentSearchResponse = {
      success: true,
      totalIncidents: sorted.length,
      generatedAt: new Date().toISOString(),
      location: location.trim(),
      timeWindow: { pastHours, futureHours },
      incidents: sorted,
      queryCount: queries.length,
      sourceCount: scrapedArticles.length,
    };

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
        timeWindow: { pastHours: 48, futureHours: 168 },
      } satisfies IncidentSearchResponse,
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'India Incident Intelligence API', version: '1.0.0' });
}