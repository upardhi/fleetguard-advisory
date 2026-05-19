import { Incident } from '@/types';

function similarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = Array.from(setA).filter((x) => setB.has(x));
  const union = new Set([...Array.from(setA), ...Array.from(setB)]);
  return intersection.length / union.size;
}

function isSameLocation(a: Incident, b: Incident): boolean {
  const cityA = a.location.city?.toLowerCase();
  const cityB = b.location.city?.toLowerCase();
  if (!cityA || !cityB) return false;
  return cityA === cityB;
}

function isSameTimeWindow(a: Incident, b: Incident): boolean {
  if (!a.incidentDateTime || !b.incidentDateTime) return true;
  const dateA = new Date(a.incidentDateTime).getTime();
  const dateB = new Date(b.incidentDateTime).getTime();
  return Math.abs(dateA - dateB) < 6 * 60 * 60 * 1000; // 6 hours
}

function mergeIncidents(a: Incident, b: Incident): Incident {
  // Merge sources
  const sourceUrls = new Set(a.sources.map((s) => s.url));
  const newSources = b.sources.filter((s) => !sourceUrls.has(s.url));

  // Keep the more detailed incident
  const base = a.summary.length >= b.summary.length ? a : b;

  return {
    ...base,
    sources: [...a.sources, ...newSources],
    media: {
      images: [...new Set([...a.media.images, ...b.media.images])].slice(0, 5),
      videos: [...new Set([...a.media.videos, ...b.media.videos])].slice(0, 3),
    },
    affectedRoutes: [...new Set([...a.affectedRoutes, ...b.affectedRoutes])],
    severity:
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].indexOf(a.severity) <
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].indexOf(b.severity)
        ? a.severity
        : b.severity,
  };
}

export function deduplicateIncidents(incidents: Incident[]): Incident[] {
  const groups: Incident[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < incidents.length; i++) {
    if (assigned.has(i)) continue;

    const group: Incident[] = [incidents[i]];
    assigned.add(i);

    for (let j = i + 1; j < incidents.length; j++) {
      if (assigned.has(j)) continue;

      const a = incidents[i];
      const b = incidents[j];

      const titleSim = similarity(a.title, b.title);
      const sameCategory = a.category === b.category;
      const sameLoc = isSameLocation(a, b);
      const sameTime = isSameTimeWindow(a, b);

      // Merge if high title similarity + same location, or exact category + location + time
      if (
        (titleSim > 0.6 && sameLoc) ||
        (sameCategory && sameLoc && sameTime && titleSim > 0.3)
      ) {
        group.push(b);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups.map((group) =>
    group.reduce((merged, incident) =>
      group.indexOf(incident) === 0 ? incident : mergeIncidents(merged, incident)
    )
  );
}

export function filterByRelevance(
  incidents: Incident[],
  location: string
): Incident[] {
  const locationParts = location.toLowerCase().split(/[\s,]+/);

  return incidents.filter((incident) => {
    const incidentText = `${incident.title} ${incident.summary} ${incident.location.city || ''} ${incident.location.state || ''}`.toLowerCase();
    return locationParts.some((part) => part.length > 2 && incidentText.includes(part));
  });
}
