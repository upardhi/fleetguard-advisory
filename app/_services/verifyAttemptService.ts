/**
 * Verify attempt service — v2 stub.
 * Tracks DL + crime-check verification runs at the gate.
 * Writes are no-ops in the v2 model (data captured in gate events instead).
 */

export interface FgVerifyAttempt {
  id: string;
  guardUid: string;
  guardName: string;
  warehouseId: string;
  orgId: string;
  dlNumber: string;
  driverDob: string;
  vehicleReg: string | null;
  contractorIds: string[];
  startedAt: Date;
  dlVerifyData: {
    provider: string;
    capturedAt: string;
    data: Record<string, unknown>;
    normalizedName: string | null;
    validationStatus: string;
    validationLabel: string;
  } | null;
  crimeCheckData: {
    provider: string;
    caseId: string;
    capturedAt: string;
    initiateData: Record<string, unknown>;
    pollData: Record<string, unknown> | null;
    totalCases: number | null;
  } | null;
  decision: "allowed" | "denied" | "abandoned" | null;
  decisionAt: Date | null;
  decisionReason: string | null;
  gateEventId: string | null;
}

export async function createVerifyAttempt(_data: {
  guardUid: string; guardName: string; warehouseId: string; orgId: string;
  dlNumber: string; driverDob: string; vehicleReg: string | null; contractorIds: string[];
}): Promise<string> {
  return `va-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function updateVerifyAttemptDl(_attemptId: string, _dl: FgVerifyAttempt["dlVerifyData"]): Promise<void> {}

export async function updateVerifyAttemptCrime(_attemptId: string, _crime: FgVerifyAttempt["crimeCheckData"]): Promise<void> {}

export async function updateVerifyAttemptDecision(
  _attemptId: string,
  _decision: "allowed" | "denied" | "abandoned",
  _opts: { gateEventId?: string | null; reason?: string | null } = {},
): Promise<void> {}
