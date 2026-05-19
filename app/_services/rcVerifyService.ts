/**
 * RC (Registration Certificate) verification service.
 *
 * Calls /api/verify/rc (IDfy ind_rc_basic), normalises the response, and
 * exposes an updateVehicleRcBackground helper that saves the result to the
 * vehicle record.
 *
 * Feature flag: NEXT_PUBLIC_RC_VERIFY_ENABLED must be "true" for calls to go
 * through. The API route also checks RC_VERIFY_ENABLED server-side, so two
 * layers of guard exist.
 */

// ── Normalised shape ─────────────────────────────────────────────────────────

export interface RcVerifyResult {
  rcNumber:          string;
  ownerName:         string;
  manufacturer:      string;  // ACTIVA 3G / Maruti Suzuki Swift etc.
  vehicleClass:      string;  // 2WN, LMV, HMV …
  fuelType:          string;
  chassisNumber:     string;
  engineNumber:      string;
  color:             string;
  rcExpiry:          string | null;  // mv_tax_upto → "YYYY-MM-DD"
  insuranceExpiry:   string | null;  // insurance_validity
  fitnessExpiry:     string | null;  // fitness_upto
  pucExpiry:         string | null;  // puc_number_upto
  registrationDate:  string | null;
  apiStatus:         string;  // "id_found" | "id_not_found" | …
}

export interface RcVerifyBundle {
  provider:   string;
  raw:        Record<string, unknown>;
  normalized: RcVerifyResult;
}

// ── Translator ───────────────────────────────────────────────────────────────

function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  // IDfy returns "YYYY-MM-DD" for RC fields already
  const trimmed = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function translateRcResponse(
  provider: string,
  raw: Record<string, unknown>,
): RcVerifyResult {
  // IDfy wraps in result.extraction_output
  const result = raw.result as Record<string, unknown> | undefined;
  const ext    = (result?.extraction_output ?? {}) as Record<string, string | null>;

  // Prefer maker_model (e.g. "ACTIVA 3G") but fall back to manufacturer field
  const manufacturer = [ext.manufacturer, ext.maker_model].filter(Boolean).join(" / ") || "";

  return {
    rcNumber:         (ext.registration_number ?? "") as string,
    ownerName:        (ext.owner_name           ?? "") as string,
    manufacturer,
    vehicleClass:     (ext.vehicle_class        ?? "") as string,
    fuelType:         (ext.fuel_type            ?? "") as string,
    chassisNumber:    (ext.chassis_number       ?? "") as string,
    engineNumber:     (ext.engine_number        ?? "") as string,
    color:            (ext.color                ?? "") as string,
    rcExpiry:         isoDate(ext.mv_tax_upto),
    insuranceExpiry:  isoDate(ext.insurance_validity),
    fitnessExpiry:    isoDate(ext.fitness_upto),
    pucExpiry:        isoDate(ext.puc_number_upto),
    registrationDate: isoDate(ext.registration_date),
    apiStatus:        (ext.status ?? (provider === "idfy" ? "id_found" : "")) as string,
  };
}

// ── Client fetch ─────────────────────────────────────────────────────────────

/** Returns null when RC_VERIFY_ENABLED is false (feature flag off). */
export async function verifyRc(rcNumber: string): Promise<RcVerifyBundle | null> {
  const res = await fetch("/api/verify/rc", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ rcNumber }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `RC verification failed (${res.status})`);
  }

  const json = (await res.json()) as
    | { disabled: true }
    | { provider: string; raw: Record<string, unknown> };

  if ("disabled" in json && json.disabled) return null;

  const { provider, raw } = json as { provider: string; raw: Record<string, unknown> };
  const normalized = translateRcResponse(provider, raw);
  return { provider, raw, normalized };
}

// ── RC background data type (subset sent to the vehicles PATCH endpoint) ─────

export interface RcBackgroundData {
  vehicleType?:     string;          // derived from rcVehicleClass — overwrites the placeholder
  rcVerifyProvider: string;
  rcVerifyData:     Record<string, unknown>;
  rcVerifiedAt:     string;
  rcOwnerName:      string;
  rcManufacturer:   string;
  rcVehicleClass:   string;
  rcFuelType:       string;
  rcChassisNumber:  string;
  rcEngineNumber:   string;
  rcColor:          string;
  // Expiry date updates (from live RC API — overwrite stored dates)
  rcExpiry?:        string;
  insuranceExpiry?: string;
  fitnessExpiry?:   string;
  pucExpiry?:       string;
}

/** Map an IDfy `vehicle_class` to a friendly vehicle-type label. */
export function vehicleClassToType(vehicleClass: string | null | undefined): string {
  if (!vehicleClass) return "unknown";
  const c = vehicleClass.toUpperCase();
  if (/2WN|MCY|MCWG|TWO[\s-]?WHEEL/.test(c)) return "two-wheeler";
  if (/3WN|THREE[\s-]?WHEEL|AUTO/.test(c))   return "three-wheeler";
  if (/HGV|HMV|MGV|HEAVY|MEDIUM/.test(c))    return "truck";
  if (/TRACTOR/.test(c))                     return "tractor";
  if (/TRAILER/.test(c))                     return "trailer";
  if (/BUS/.test(c))                         return "bus";
  if (/^LMV|LIGHT MOTOR/.test(c))            return "light-motor";
  return vehicleClass.toLowerCase();
}

export function bundleToRcBackground(bundle: RcVerifyBundle): RcBackgroundData {
  const n = bundle.normalized;
  return {
    vehicleType:      vehicleClassToType(n.vehicleClass),
    rcVerifyProvider: bundle.provider,
    rcVerifyData:     bundle.raw,
    rcVerifiedAt:     new Date().toISOString(),
    rcOwnerName:      n.ownerName,
    rcManufacturer:   n.manufacturer,
    rcVehicleClass:   n.vehicleClass,
    rcFuelType:       n.fuelType,
    rcChassisNumber:  n.chassisNumber,
    rcEngineNumber:   n.engineNumber,
    rcColor:          n.color,
    ...(n.rcExpiry        ? { rcExpiry:        n.rcExpiry }        : {}),
    ...(n.insuranceExpiry ? { insuranceExpiry: n.insuranceExpiry } : {}),
    ...(n.fitnessExpiry   ? { fitnessExpiry:   n.fitnessExpiry }   : {}),
    ...(n.pucExpiry       ? { pucExpiry:       n.pucExpiry }       : {}),
  };
}
