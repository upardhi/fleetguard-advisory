"use client";

/**
 * WarehouseFilterContext
 *
 * Provides the currently-selected warehouse ID across all manager pages.
 * - "all"  → cross-warehouse view (pan-org)
 * - <id>   → scoped to that warehouse
 *
 * Default is the user's assigned warehouseId from their profile.
 * Selection is persisted to localStorage so it survives navigation.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

export interface WarehouseOption {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface WarehouseFilterContextValue {
  /** "all" or a specific warehouse ID */
  selectedId: string;
  /** Convenience: returns selectedId unless "all", then falls back to defaultId */
  activeWarehouseId: string;
  warehouses: WarehouseOption[];
  setSelectedId: (id: string) => void;
}

const WarehouseFilterContext = createContext<WarehouseFilterContextValue>({
  selectedId: "all",
  activeWarehouseId: "",
  warehouses: [],
  setSelectedId: () => {},
});

const STORAGE_KEY = "fg_warehouse_filter";

export function WarehouseFilterProvider({
  defaultWarehouseId,
  warehouses,
  children,
}: {
  defaultWarehouseId: string;
  warehouses: WarehouseOption[];
  children: ReactNode;
}) {
  const [selectedId, setSelectedIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) ?? defaultWarehouseId;
    }
    return defaultWarehouseId;
  });

  // Keep localStorage in sync
  function setSelectedId(id: string) {
    setSelectedIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }

  // If default changes (user logs in fresh) and nothing saved, reset
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!saved) setSelectedIdState(defaultWarehouseId);
  }, [defaultWarehouseId]);

  const activeWarehouseId = selectedId === "all" ? defaultWarehouseId : selectedId;

  return (
    <WarehouseFilterContext.Provider value={{ selectedId, activeWarehouseId, warehouses, setSelectedId }}>
      {children}
    </WarehouseFilterContext.Provider>
  );
}

export function useWarehouseFilter() {
  return useContext(WarehouseFilterContext);
}
