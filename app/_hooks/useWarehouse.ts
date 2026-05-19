"use client";

import { useEffect, useState } from "react";
import type { UserProfileV2 } from "./useAuthV2";

export interface FgWarehouse {
  id:       string;
  name:     string;
  city:     string;
  state:    string;
  region:   string;
  orgId:    string;
  isActive: boolean;
  lat?:     number;
  lng?:     number;
}

// Module-level cache — all hook instances share one fetch per warehouse ID.
const cache   = new Map<string, FgWarehouse>();
const inflight = new Map<string, Promise<FgWarehouse | null>>();
const subs     = new Map<string, Set<(w: FgWarehouse) => void>>();

function subscribe(id: string, fn: (w: FgWarehouse) => void) {
  if (!subs.has(id)) subs.set(id, new Set());
  subs.get(id)!.add(fn);
}
function unsubscribe(id: string, fn: (w: FgWarehouse) => void) {
  subs.get(id)?.delete(fn);
}

async function fetchWarehouse(id: string): Promise<FgWarehouse | null> {
  if (inflight.has(id)) return inflight.get(id)!;

  const p = fetch(`/api/v2/warehouses/${id}`, { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json() as { warehouse: Record<string, unknown> };
      const w = data.warehouse;
      const result: FgWarehouse = {
        id:       w.id       as string,
        name:     w.name     as string,
        city:     w.city     as string,
        state:    w.state    as string,
        region:   w.region   as string,
        orgId:    (w.org_id  as string) ?? "",
        isActive: (w.is_active ?? true) as boolean,
        lat:      (w.lat     as number | null) ?? undefined,
        lng:      (w.lng     as number | null) ?? undefined,
      };
      cache.set(id, result);
      subs.get(id)?.forEach((fn) => fn(result));
      return result;
    })
    .catch((err) => { console.error(err); return null; })
    .finally(() => inflight.delete(id));

  inflight.set(id, p);
  return p;
}

export function useWarehouse(fgUser: UserProfileV2 | null): {
  warehouse: FgWarehouse | null;
  loading:   boolean;
} {
  const id = fgUser?.warehouseId ?? null;
  const [warehouse, setWarehouse] = useState<FgWarehouse | null>(id ? (cache.get(id) ?? null) : null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!id) return;

    // Already cached — use immediately, no fetch needed.
    if (cache.has(id)) {
      setWarehouse(cache.get(id)!);
      return;
    }

    setLoading(true);
    const cb = (w: FgWarehouse) => { setWarehouse(w); setLoading(false); };
    subscribe(id, cb);
    fetchWarehouse(id).then((w) => { if (!w) setLoading(false); });

    return () => unsubscribe(id, cb);
  }, [id]);

  return { warehouse, loading };
}
