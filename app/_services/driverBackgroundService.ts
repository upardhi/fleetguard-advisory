/** Driver background check service — v2 stub. Returns empty history (no Supabase table yet). */

import type { BGStatus } from "../_lib/types";

export interface FgDriverBackground {
  id: string;
  driverId: string;
  status: BGStatus;
  vendor: string;
  referenceId: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  notes: string | null;
  requestedByUid: string;
}

export async function getBgHistoryForDriver(_driverId: string, _maxRecords = 10): Promise<FgDriverBackground[]> {
  return [];
}

export async function getLatestBgCheck(_driverId: string): Promise<FgDriverBackground | null> {
  return null;
}

export async function createBgCheckRecord(_data: Omit<FgDriverBackground, "id">): Promise<string> {
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
