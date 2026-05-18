"use client";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface AdvisoryWarehouse {
  id:      string;
  name:    string;
  code:    string;
  city:    string;
  state:   string;
  region:  string;
  address: string;
  orgId:   string;
  lat:     number | null;
  lng:     number | null;
}

export interface AdvisoryUser {
  id:          string;
  email:       string;
  name:        string;
  role:        string;
  orgId:       string;
  orgName:     string;
  warehouseId: string | null;
}

interface AdvisoryCtx {
  user:               AdvisoryUser | null;
  warehouses:         AdvisoryWarehouse[];
  selectedWarehouse:  AdvisoryWarehouse | null;
  loading:            boolean;
  selectWarehouse:    (w: AdvisoryWarehouse) => void;
  clearWarehouse:     () => void;
  refresh:            () => Promise<void>;
}

const Ctx = createContext<AdvisoryCtx | null>(null);

const LS_KEY = "fg_advisory_warehouse";

export function AdvisoryProvider({ children }: { children: ReactNode }) {
  const [user,              setUser]              = useState<AdvisoryUser | null>(null);
  const [warehouses,        setWarehouses]        = useState<AdvisoryWarehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<AdvisoryWarehouse | null>(null);
  const [loading,           setLoading]           = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, whRes] = await Promise.all([
        fetch("/api/auth/v2/me"),
        fetch("/api/advisory/v1/warehouses"),
      ]);

      if (!meRes.ok) { setLoading(false); return; }

      const meData  = await meRes.json() as AdvisoryUser;
      const whData  = whRes.ok ? (await whRes.json() as { warehouses: AdvisoryWarehouse[] }) : { warehouses: [] };

      setUser(meData);
      setWarehouses(whData.warehouses);

      // Restore persisted selection
      const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AdvisoryWarehouse;
          const still  = whData.warehouses.find((w) => w.id === parsed.id);
          if (still) { setSelectedWarehouse(still); setLoading(false); return; }
        } catch { /* stale */ }
      }

      // Auto-select if user has exactly one warehouse, or if assigned one
      if (meData.warehouseId) {
        const assigned = whData.warehouses.find((w) => w.id === meData.warehouseId);
        if (assigned) { setSelectedWarehouse(assigned); setLoading(false); return; }
      }
      if (whData.warehouses.length === 1) {
        setSelectedWarehouse(whData.warehouses[0]);
      }
    } catch (err) {
      console.error("advisory context load", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function selectWarehouse(w: AdvisoryWarehouse) {
    setSelectedWarehouse(w);
    localStorage.setItem(LS_KEY, JSON.stringify(w));
  }

  function clearWarehouse() {
    setSelectedWarehouse(null);
    localStorage.removeItem(LS_KEY);
  }

  return (
    <Ctx.Provider value={{ user, warehouses, selectedWarehouse, loading, selectWarehouse, clearWarehouse, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdvisory(): AdvisoryCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdvisory must be used inside AdvisoryProvider");
  return ctx;
}
