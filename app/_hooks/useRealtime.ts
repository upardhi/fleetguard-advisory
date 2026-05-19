"use client";

/**
 * useRealtime — polling-based replacement for Firestore onSnapshot.
 * Accepts a fetch function and polls at the given interval.
 */

import { useEffect, useState, useRef, useCallback } from "react";

export interface RealtimeState<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export function useRealtime<T>(
  fetchFn: (() => Promise<T[]>) | null,
  intervalMs = 15_000,
): RealtimeState<T> {
  const [state, setState] = useState<RealtimeState<T>>({ data: [], loading: true, error: null });
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const run = useCallback(async () => {
    if (!fetchRef.current) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    try {
      const data = await fetchRef.current();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err as Error }));
    }
  }, []);

  useEffect(() => {
    if (!fetchFn) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    void run();
    const timer = setInterval(() => { void run(); }, intervalMs);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, intervalMs]);

  return state;
}
