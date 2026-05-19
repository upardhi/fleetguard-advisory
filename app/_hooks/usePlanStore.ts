"use client";

import { useState, useEffect, useCallback } from "react";
import type { DispatchPlan } from "../_lib/types";
import { MOCK_DISPATCH_PLANS } from "../_lib/mockData";

const STORAGE_KEY = "advisory_dispatch_plans";

function load(): DispatchPlan[] {
  if (typeof window === "undefined") return MOCK_DISPATCH_PLANS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return MOCK_DISPATCH_PLANS;
    return JSON.parse(raw) as DispatchPlan[];
  } catch {
    return MOCK_DISPATCH_PLANS;
  }
}

function save(plans: DispatchPlan[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch { /* ignore */ }
}

export function usePlanStore() {
  const [plans, setPlans] = useState<DispatchPlan[]>(MOCK_DISPATCH_PLANS);

  useEffect(() => {
    setPlans(load());
  }, []);

  const addPlan = useCallback((plan: DispatchPlan) => {
    setPlans((prev) => {
      const next = [plan, ...prev];
      save(next);
      return next;
    });
  }, []);

  const updatePlan = useCallback((id: string, patch: Partial<DispatchPlan>) => {
    setPlans((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      save(next);
      return next;
    });
  }, []);

  const deletePlan = useCallback((id: string) => {
    setPlans((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save(next);
      return next;
    });
  }, []);

  return { plans, addPlan, updatePlan, deletePlan };
}
