/** Visitor config service — v2 API backed. Returns per-org configurable lists for the visitor entry form. */

import { api } from "./v2/api";

export interface FgVisitorConfig {
  orgId: string;
  visitorTypes: string[];
  idTypes: string[];
  departments: string[];
  updatedAt: Date;
}

const DEFAULT_VISITOR_TYPES = ["Visitor", "Contractor", "Maintenance", "Auditor", "Other"];
const DEFAULT_ID_TYPES = ["Aadhaar", "PAN", "Passport", "Driving Licence", "Employee ID"];
const DEFAULT_DEPARTMENTS = ["Dispatch", "Commercial", "Safety", "Operations", "Finance", "HR"];

export const VISITOR_CONFIG_DEFAULTS: Omit<FgVisitorConfig, "orgId" | "updatedAt"> = {
  visitorTypes: DEFAULT_VISITOR_TYPES,
  idTypes: DEFAULT_ID_TYPES,
  departments: DEFAULT_DEPARTMENTS,
};

export async function getVisitorConfig(orgId: string): Promise<FgVisitorConfig> {
  try {
    const data = await api.get<{ config: Partial<FgVisitorConfig> }>(`/api/v2/orgs/${orgId}/visitor-config`);
    return {
      orgId,
      visitorTypes: data.config?.visitorTypes ?? DEFAULT_VISITOR_TYPES,
      idTypes: data.config?.idTypes ?? DEFAULT_ID_TYPES,
      departments: data.config?.departments ?? DEFAULT_DEPARTMENTS,
      updatedAt: new Date(),
    };
  } catch {
    return { orgId, ...VISITOR_CONFIG_DEFAULTS, updatedAt: new Date() };
  }
}

export async function saveVisitorConfig(
  _orgId: string,
  _data: Pick<FgVisitorConfig, "visitorTypes" | "idTypes" | "departments">,
): Promise<void> {
  // No-op: visitor config persistence not yet implemented in v2 API
}
