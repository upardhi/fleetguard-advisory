'use client';

import { useState, useCallback } from 'react';
import { Incident, IncidentCategory, IncidentSearchResponse } from '@/types';

interface UseIncidentsReturn {
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  meta: Partial<IncidentSearchResponse>;
  search: (location: string, categories?: IncidentCategory[]) => Promise<void>;
  clear: () => void;
}

export function useIncidents(): UseIncidentsReturn {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Partial<IncidentSearchResponse>>({});

  const search = useCallback(
    async (location: string, categories: IncidentCategory[] = []) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location,
            radiusKm: 50,
            pastHours: 48,
            futureHours: 48,
            categories,
          }),
        });

        const data: IncidentSearchResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch incidents');
        }

        setIncidents(data.incidents || []);
        setMeta({
          generatedAt: data.generatedAt,
          location: data.location,
          totalIncidents: data.totalIncidents,
          queryCount: data.queryCount,
          sourceCount: data.sourceCount,
          timeWindow: data.timeWindow,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setIncidents([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    setIncidents([]);
    setError(null);
    setMeta({});
  }, []);

  return { incidents, loading, error, meta, search, clear };
}
