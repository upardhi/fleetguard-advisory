import { v4 as uuidv4 } from 'uuid';
import {
  Incident,
  IncidentCategory,
  IncidentLocation,
  SeverityLevel,
  ScrapedContent,
  RSSItem,
  IncidentSource,
} from '@/types';
import { CATEGORY_KEYWORDS, INDIAN_STATES } from '@/lib/constants';
import {
  parseDate,
  extractDateFromText,
  determineIncidentStatus,
  isWithinTimeWindow,
  extractEventDate,
} from '@/lib/date-parser';
import { detectSourceType } from './firecrawl.service';
import { extractIncidentWithAI } from './ai/incident-ai-parser.service';

const SEVERITY_KEYWORDS: Record<SeverityLevel, string[]> = {
  CRITICAL: ['critical', 'severe', 'major', 'massive', 'fatal', 'deaths', 'killed', 'disaster', 'emergency'],
  HIGH: ['high', 'significant', 'serious', 'dangerous', 'heavy', 'large-scale', 'blocked', 'curfew'],
  MEDIUM: ['moderate', 'medium', 'disruption', 'delay', 'traffic', 'slow'],
  LOW: ['minor', 'small', 'slight', 'brief', 'temporary'],
  UNKNOWN: [],
};

const AFFECTED_ROUTE_PATTERNS = [
  /NH[\s-]?\d+/g,
  /SH[\s-]?\d+/g,
  /(?:ring road|bypass|flyover|bridge|highway|expressway)[^,.\n]*/gi,
  /(?:station|junction|crossing)[^,.\n]*/gi,
];

export function detectCategory(text: string): IncidentCategory {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return category as IncidentCategory;
      }
    }
  }
  return 'other';
}

export function detectSeverity(text: string): SeverityLevel {
  const lower = text.toLowerCase();
  for (const [severity, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    if (severity === 'UNKNOWN') continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return severity as SeverityLevel;
      }
    }
  }
  return 'UNKNOWN';
}

export function extractLocation(text: string, searchLocation: string): IncidentLocation {
  const result: IncidentLocation = {
    area: null,
    city: null,
    district: null,
    state: null,
    pincode: null,
    latitude: null,
    longitude: null,
  };

  // Extract state
  for (const state of INDIAN_STATES) {
    if (text.toLowerCase().includes(state.toLowerCase())) {
      result.state = state;
      break;
    }
  }

  // Extract PIN code
  const pinMatch = text.match(/\b\d{6}\b/);
  if (pinMatch) {
    result.pincode = pinMatch[0];
  }

  // Use search location to fill gaps
  const parts = searchLocation.split(/[\s,]+/);
  if (parts.length >= 2) {
    result.city = result.city || parts[0];
    if (!result.state) {
      result.state = parts.slice(1).join(' ');
    }
  } else {
    result.city = result.city || searchLocation;
  }

  return result;
}

export function extractAffectedRoutes(text: string): string[] {
  const routes: string[] = [];
  for (const pattern of AFFECTED_ROUTE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) routes.push(...matches);
  }
  return Array.from(new Set(routes)).slice(0, 10);
}

export function generateSummary(text: string, title: string): string {
  // Try to get first meaningful sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  const summary = sentences.slice(0, 3).join('. ').trim();
  if (summary.length > 50) return summary.slice(0, 500) + (summary.length > 500 ? '...' : '');
  return title;
}

export async function parseIncidentFromScrapedContent(
  content: ScrapedContent,
  searchLocation: string,
  pastHours: number,
  futureHours: number,
  queryType: 'past' | 'future' = 'past'
): Promise<Incident | null> {
  const combinedText = `${content.title} ${content.text}`;
  debugger;
  // Parse date
  const pubDate = content.publishedAt ? parseDate(content.publishedAt) : null;
  const textDate = extractDateFromText(content.text);
  const eventDate = extractEventDate(combinedText);

  const parsedEventDate =
    eventDate.startDate
      ? new Date(eventDate.startDate)
      : null;

  const incidentDate =
    parsedEventDate ||
    pubDate ||
    textDate;

  // Check time window
  if (!isWithinTimeWindow(incidentDate, pastHours, futureHours)) {
    return null;
  }

  let aiData = null;

  try {
    aiData = await extractIncidentWithAI(combinedText);
  } catch (err) {
    console.error('AI extraction failed:', err);
  }

  const category =
    aiData?.category ||
    detectCategory(combinedText);
  const severity =
    aiData?.severity ||
    detectSeverity(combinedText);
  const location = extractLocation(combinedText, searchLocation);
  const affectedRoutes = extractAffectedRoutes(combinedText);
  const status =
    aiData?.status ||
    determineIncidentStatus(
      incidentDate,
      combinedText
    );

  // Override status based on query type hints
  const finalStatus =
    queryType === 'future' && status === 'ACTIVE' ? 'UPCOMING' : status;

  const summary = generateSummary(content.text, content.title);

  if (!content.title || content.title.length < 5) return null;

  return {
    id: uuidv4(),
    title: content.title.trim(),
    category,
    status: finalStatus,
    summary,
    severity,
    incidentDateTime: incidentDate ? incidentDate.toISOString() : null,
    location,
    affectedRoutes,
    trafficImpact:
      aiData?.trafficImpact ||
      extractTrafficImpact(combinedText),
    travelAdvisory:
      aiData?.travelAdvisory || null,
    affectedAreas:
      aiData?.affectedAreas || [],
    confidence:
      aiData?.confidence || 0.5,
    media: {
      images: content.images.slice(0, 5),
      videos: [],
    },
    sources: [
      {
        url: content.url,
        type: content.sourceType,
        publishedAt: content.publishedAt,
        title: content.title,
      },
    ],
    rawText: content.text.slice(0, 1000),
  };
}

export async function parseIncidentFromRSSItem(
  item: RSSItem,
  searchLocation: string,
  pastHours: number,
  futureHours: number,
  queryType: 'past' | 'future' = 'past'
): Promise<Incident | null> {
  const combinedText = `${item.title} ${item.description} ${item.content || ''}`;

  const pubDate = item.pubDate ? parseDate(item.pubDate) : null;

  const eventDate = extractEventDate(combinedText);

  const parsedEventDate =
    eventDate.startDate
      ? new Date(eventDate.startDate)
      : null;

  const finalDate =
    parsedEventDate || pubDate;

  if (!isWithinTimeWindow(finalDate, pastHours, futureHours)) {
    return null;
  }

  let aiData = null;

  try {
    aiData = await extractIncidentWithAI(combinedText);
  } catch (err) {
    console.error('AI extraction failed:', err);
  }

  const category =
    aiData?.category ||
    detectCategory(combinedText);
  const severity =
    aiData?.severity ||
    detectSeverity(combinedText);
  const location = extractLocation(combinedText, searchLocation);
  const status =
    aiData?.status ||
    determineIncidentStatus(finalDate, combinedText);
  const finalStatus =
    queryType === 'future' && status === 'ACTIVE' ? 'UPCOMING' : status;

  if (!item.title || item.title.length < 5) return null;

  return {
    id: uuidv4(),
    title: item.title.trim(),
    category,
    status: finalStatus,
    summary: item.description.slice(0, 500) || item.title,
    severity,
    incidentDateTime:
      finalDate
        ? finalDate.toISOString()
        : null,
    eventDateText: eventDate.rawText,
    location,
    affectedRoutes: extractAffectedRoutes(combinedText),
    trafficImpact:
      aiData?.trafficImpact ||
      extractTrafficImpact(combinedText),
    travelAdvisory:
      aiData?.travelAdvisory || null,

    affectedAreas:
      aiData?.affectedAreas || [],

    confidence:
      aiData?.confidence || 0.5,
    media: { images: [], videos: [] },
    sources: [
      {
        url: item.link,
        type: detectSourceType(item.link),
        publishedAt: item.pubDate,
        title: item.title,
      },
    ],
  };
}

function extractTrafficImpact(text: string): string | null {
  const patterns = [
    /traffic[^.]*(?:disrupted|blocked|affected|diverted)[^.]*/gi,
    /(?:road|highway|street)[^.]*(?:closed|blocked|diverted)[^.]*/gi,
    /(?:commuters|travellers)[^.]*(?:face|experience|advised)[^.]*/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) {
      return match[0].trim().slice(0, 200);
    }
  }
  return null;
}
