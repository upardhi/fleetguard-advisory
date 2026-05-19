import { parseISO, isValid, subHours, addHours } from 'date-fns';
import { IncidentStatus } from '@/types';
import * as chrono from 'chrono-node';

const HINDI_MONTHS: Record<string, number> = {
  जनवरी: 0, फरवरी: 1, मार्च: 2, अप्रैल: 3, मई: 4, जून: 5,
  जुलाई: 6, अगस्त: 7, सितंबर: 8, अक्तूबर: 9, नवंबर: 10, दिसंबर: 11,
};

const RELATIVE_DATE_PATTERNS: Array<{ pattern: RegExp; hoursOffset: number }> = [
  { pattern: /\bjust now\b/i, hoursOffset: 0 },
  { pattern: /\b(\d+)\s*minutes?\s*ago\b/i, hoursOffset: -1 / 60 },
  { pattern: /\b(\d+)\s*hours?\s*ago\b/i, hoursOffset: -1 },
  { pattern: /\byesterday\b/i, hoursOffset: -24 },
  { pattern: /\btomorrow\b/i, hoursOffset: 24 },
  { pattern: /\bnext\s+week\b/i, hoursOffset: 168 },
  { pattern: /\b2\s*days?\s*ago\b/i, hoursOffset: -48 },
  { pattern: /\bin\s+(\d+)\s*hours?\b/i, hoursOffset: 1 },
  { pattern: /\bnext\s+2\s*days?\b/i, hoursOffset: 36 },
];

export function parseDate(text: string): Date | null {
  if (!text) return null;

  // Try ISO parse first
  try {
    const iso = parseISO(text);
    if (isValid(iso)) return iso;
  } catch { }

  const now = new Date();

  // Try relative dates
  for (const { pattern, hoursOffset } of RELATIVE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const multiplier = match[1] ? parseInt(match[1]) : 1;
      return addHours(now, hoursOffset * multiplier);
    }
  }

  // Try common date formats
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/,
    /(\d{1,2})\s+(\w+)\s+(\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = new Date(match[0]);
        if (isValid(parsed)) return parsed;
      } catch { }
    }
  }

  return null;
}

export function extractDateFromText(content: string): Date | null {
  // Look for explicit date patterns in content
  const dateMatches = content.match(
    /(?:published|updated|posted|reported|date)[:\s]+([^\n.]+)/i
  );
  if (dateMatches) {
    const parsed = parseDate(dateMatches[1]);
    if (parsed) return parsed;
  }

  // Look for timestamps
  const timestampMatch = content.match(
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/
  );
  if (timestampMatch) {
    const parsed = parseDate(timestampMatch[1]);
    if (parsed) return parsed;
  }

  return null;
}

export function determineIncidentStatus(
  incidentDate: Date | null,
  content: string
): IncidentStatus {
  const now = new Date();
  const past48h = subHours(now, 48);
  const future48h = addHours(now, 48);

  // Check content for future indicators
  const futureKeywords = [
    'tomorrow', 'next week', 'upcoming', 'planned', 'scheduled',
    'will be', 'going to', 'expected', 'कल', 'आगामी', 'आने वाले',
    'planned disruption', 'road closure on', 'maintenance on',
    'this weekend',
    'next monday',
    'next tuesday',
    'next friday',
    'weekend',
    'from 4am to 8pm',
    'visit',
    'convoy',
  ];

  const hasFutureKeyword = futureKeywords.some((kw) =>
    content.toLowerCase().includes(kw.toLowerCase())
  );

  if (incidentDate) {
    if (incidentDate > now && incidentDate <= future48h) return 'UPCOMING';
    if (incidentDate >= past48h && incidentDate <= now) return 'ACTIVE';
    if (incidentDate < past48h) return 'PAST';
  }

  if (hasFutureKeyword) return 'UPCOMING';

  return 'ACTIVE';
}

export function isWithinTimeWindow(
  date: Date | null,
  pastHours: number,
  futureHours: number
): boolean {
  if (!date) return true; // Include if we can't determine date
  const now = new Date();
  const earliest = subHours(now, pastHours);
  const latest = addHours(now, futureHours);
  return date >= earliest && date <= latest;
}

export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Unknown time';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return dateString;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMs < 0) {
      const futureDiffHours = Math.abs(diffHours);
      if (futureDiffHours < 1) return 'In a few minutes';
      if (futureDiffHours < 24) return `In ${futureDiffHours}h`;
      return `In ${Math.floor(futureDiffHours / 24)}d`;
    }

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return dateString;
  }
}


export interface ParsedEventDate {
  rawText: string | null;
  startDate: string | null;
  endDate: string | null;
}

export function extractEventDate(text: string): ParsedEventDate {
  try {
    const results = chrono.parse(text);
    
    if (!results || results.length === 0) {
      return {
        rawText: null,
        startDate: null,
        endDate: null,
      };
    }

    const first = results[0];

    return {
      rawText: first.text || null,
      startDate: first.start
        ? first.start.date().toISOString()
        : null,
      endDate: first.end
        ? first.end.date().toISOString()
        : null,
    };
  } catch (err) {
    console.error('Chrono parse error:', err);

    return {
      rawText: null,
      startDate: null,
      endDate: null,
    };
  }
}