/** Compliance service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import type { ComplianceBucket } from "../_lib/types";

export async function getComplianceBuckets(warehouseId: string): Promise<ComplianceBucket> {
  const data = await api.get<ComplianceBucket>(
    `/api/v2/compliance?warehouseId=${encodeURIComponent(warehouseId)}`,
  );
  return {
    dl_0_30:          Number(data.dl_0_30 ?? 0),
    dl_31_60:         Number(data.dl_31_60 ?? 0),
    dl_61_90:         Number(data.dl_61_90 ?? 0),
    vehicle_0_30:     Number(data.vehicle_0_30 ?? 0),
    vehicle_31_60:    Number(data.vehicle_31_60 ?? 0),
    vehicle_61_90:    Number(data.vehicle_61_90 ?? 0),
    contractor_0_30:  Number(data.contractor_0_30 ?? 0),
    contractor_31_60: Number(data.contractor_31_60 ?? 0),
    contractor_61_90: Number(data.contractor_61_90 ?? 0),
  };
}

export async function getGlobalComplianceBuckets(_orgId: string): Promise<ComplianceBucket> {
  const data = await api.get<ComplianceBucket>(`/api/v2/compliance`);
  return {
    dl_0_30:          Number(data.dl_0_30 ?? 0),
    dl_31_60:         Number(data.dl_31_60 ?? 0),
    dl_61_90:         Number(data.dl_61_90 ?? 0),
    vehicle_0_30:     Number(data.vehicle_0_30 ?? 0),
    vehicle_31_60:    Number(data.vehicle_31_60 ?? 0),
    vehicle_61_90:    Number(data.vehicle_61_90 ?? 0),
    contractor_0_30:  Number(data.contractor_0_30 ?? 0),
    contractor_31_60: Number(data.contractor_31_60 ?? 0),
    contractor_61_90: Number(data.contractor_61_90 ?? 0),
  };
}
