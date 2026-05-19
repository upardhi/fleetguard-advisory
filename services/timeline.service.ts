import { Incident, IncidentStatus } from '@/types';

export function sortIncidentsByTime(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => {
    // Status priority: ACTIVE > UPCOMING > PAST
    const statusOrder: Record<IncidentStatus, number> = {
      ACTIVE: 0,
      UPCOMING: 1,
      PAST: 2,
    };

    if (a.status !== b.status) {
      return statusOrder[a.status] - statusOrder[b.status];
    }

    // Then by date
    const dateA = a.incidentDateTime ? new Date(a.incidentDateTime).getTime() : 0;
    const dateB = b.incidentDateTime ? new Date(b.incidentDateTime).getTime() : 0;

    if (a.status === 'UPCOMING') {
      return dateA - dateB; // Upcoming: earliest first
    }
    return dateB - dateA; // Past/Active: most recent first
  });
}

export function groupIncidentsByStatus(incidents: Incident[]): {
  active: Incident[];
  upcoming: Incident[];
  past: Incident[];
} {
  return {
    active: incidents.filter((i) => i.status === 'ACTIVE'),
    upcoming: incidents.filter((i) => i.status === 'UPCOMING'),
    past: incidents.filter((i) => i.status === 'PAST'),
  };
}

export function groupIncidentsByDate(incidents: Incident[]): Record<string, Incident[]> {
  const groups: Record<string, Incident[]> = {};

  for (const incident of incidents) {
    const dateKey = incident.incidentDateTime
      ? new Date(incident.incidentDateTime).toDateString()
      : 'Unknown Date';

    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(incident);
  }

  return groups;
}

export function groupIncidentsByCategory(incidents: Incident[]): Record<string, Incident[]> {
  const groups: Record<string, Incident[]> = {};
  for (const incident of incidents) {
    if (!groups[incident.category]) groups[incident.category] = [];
    groups[incident.category].push(incident);
  }
  return groups;
}
