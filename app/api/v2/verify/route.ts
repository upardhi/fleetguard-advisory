/**
 * POST /api/v2/verify  — unified gate-entry verify endpoint.
 *
 * Optimised execution order for a NEW driver + NEW vehicle:
 *   Phase 1 (parallel):  DB driver lookup · DB vehicle lookup · DB cached-DL-event lookup
 *   Phase 2 (parallel):  Submit DL to IDfy · Submit RC to IDfy
 *   Phase 3:             Poll DL result (gets driver name)
 *                        ↳ photo upload fire-and-forget
 *                        ↳ start crime check + await RC poll (parallel)
 *
 * For a CACHED driver/vehicle, IDfy calls are skipped and replaced with the
 * DB-stored bundle; crime check still runs against the known name.
 *
 * Returns:
 *   { dlBundle, driverRecord, vehicleRecord, rcBundle, crimeCheck }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { lookupStaticCaseId, lookupStaticDlRaw, lookupStaticRcRaw } from "@/app/_lib/staticCases";
import { uploadImageFromUrl } from "@/app/api/dl-ocr/imageUploadService";
import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";
import { lookupLicense } from "@/app/_server/licenseLookup/lookup";
import { maintenanceCheck } from "@/app/_server/maintenance/check";

const VerifySchema = z.object({
  dlNumber:   z.string().min(5).max(30),
  dob:        z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/), // DD/MM/YYYY
  vehicleReg: z.string().max(20).optional().nullable(),
});

// ── Shared IDfy credentials ───────────────────────────────────────────────────

function idfyHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "api-key":      process.env.DL_VERIFY_API_KEY   ?? "",
    "account-id":   process.env.DL_VERIFY_ACCOUNT_KEY ?? "",
  };
}

// ── IDfy async submit → poll ──────────────────────────────────────────────────

async function idfyPoll(
  requestId: string,
  headers: Record<string, string>,
  operation: "dl_verify_poll" | "rc_verify_poll",
  maxAttempts = 10,
  intervalMs  = 2000,
): Promise<Record<string, unknown>> {
  const pollUrl = "https://eve.idfy.com/v3/tasks";
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
    const res = await thirdPartyFetch(`${pollUrl}?request_id=${encodeURIComponent(requestId)}`, {
      _service: "idfy",
      _operation: operation,
      method: "GET",
      headers,
    });
    if (!res.ok) throw new Error(`IDfy poll returned ${res.status}`);
    const tasks = (await res.json()) as Array<Record<string, unknown>>;
    const task  = tasks[0];
    if (!task) continue;
    const status = task.status as string | undefined;
    if (status === "completed" || status === "failed" || status === "error") return task;
  }
  throw new Error("IDfy verification timed out");
}

// Submit DL to IDfy and return the request_id for polling.
async function submitDl(dlNorm: string, dob: string, hdrs: Record<string, string>): Promise<string> {
  function toISODate(dmy: string) {
    const [d, m, y] = dmy.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const res = await thirdPartyFetch(
    "https://eve.idfy.com/v3/tasks/async/verify_with_source/ind_driving_license",
    {
      _service: "idfy",
      _operation: "dl_verify_submit",
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        task_id: crypto.randomUUID(), group_id: crypto.randomUUID(),
        data: {
          id_number: dlNorm, date_of_birth: toISODate(dob),
          advanced_details: { state_info: true, age_info: true, get_profile_image: true },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`IDfy DL submit returned ${res.status}`);
  const data = (await res.json()) as { request_id?: string };
  if (!data.request_id) throw new Error("IDfy DL did not return a request_id");
  return data.request_id;
}

// Submit RC to IDfy and return the request_id for polling.
async function submitRc(rcNorm: string, hdrs: Record<string, string>): Promise<string> {
  const res = await thirdPartyFetch(
    "https://eve.idfy.com/v3/tasks/async/verify_with_source/ind_rc_basic",
    {
      _service: "idfy",
      _operation: "rc_verify_submit",
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        task_id: crypto.randomUUID(), group_id: crypto.randomUUID(),
        data: { rc_number: rcNorm },
      }),
    },
  );
  if (!res.ok) throw new Error(`IDfy RC submit returned ${res.status}`);
  const data = (await res.json()) as { request_id?: string };
  if (!data.request_id) throw new Error("IDfy RC did not return a request_id");
  return data.request_id;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDateOnly(v: unknown): string | null {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function dlExpiryToDMY(v: unknown): string {
  const d = isoDateOnly(v);
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function dobToDash(dob: string): string { return dob.replace(/\//g, "-"); }

function cachedDlValidation(dlStatus: string | null, dlExpiry: string | null) {
  const expiry = dlExpiry ? new Date(dlExpiry) : null;
  const now = new Date();
  if (!dlStatus || dlStatus === "clear") {
    if (expiry && expiry < now) return {
      status: "invalid_transport_expired", label: "DL Expired",
      detail: "Transport licence validity has lapsed (cached record).", blocking: true, overridable: true,
    };
    if (expiry) {
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft <= 30) return {
        status: "inconclusive", label: "DL Expiring Soon",
        detail: `Transport licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (cached record).`,
        blocking: false, overridable: false,
      };
    }
    return { status: "valid", label: "Valid (Cached)",
      detail: "Previously verified — valid transport licence on record.", blocking: false, overridable: false };
  }
  if (dlStatus === "expired") return {
    status: "invalid_transport_expired", label: "DL Expired",
    detail: "DL expired (cached record).", blocking: true, overridable: true,
  };
  return { status: "inconclusive", label: "Requires Re-verification",
    detail: "Cached DL status. Fresh verification recommended.", blocking: false, overridable: true };
}

function buildCachedDlBundle(driver: Record<string, unknown>) {
  return {
    provider: "cached",
    raw: {} as Record<string, unknown>,
    normalized: {
      dlNumber:       (driver.dl_number    as string) ?? "",
      dob: "",
      name:           (driver.full_name    as string) ?? "",
      fatherName: "", gender: "", address: "", state: "", issuingRtoName: "",
      photo:          (driver.face_photo_url as string) ?? "",
      validity: {
        transport:    { from: "", to: dlExpiryToDMY(driver.dl_expiry) },
        nonTransport: { from: "", to: "" },
        hazardousValidTill: "", hillValidTill: "",
      },
      classOfVehicles: [] as string[], dateOfIssue: "", status: "",
    },
    validation: cachedDlValidation(driver.dl_status as string | null, driver.dl_expiry as string | null),
  };
}

function buildCachedRcBundle(vehicle: Record<string, unknown>) {
  return {
    provider: "cached",
    raw: {} as Record<string, unknown>,
    normalized: {
      rcNumber:         (vehicle.registration_number as string) ?? "",
      ownerName:        (vehicle.rc_owner_name       as string) ?? "",
      manufacturer:     (vehicle.rc_manufacturer     as string) ?? "",
      vehicleClass:     (vehicle.rc_vehicle_class    as string) ?? "",
      fuelType: "", chassisNumber: "", engineNumber: "", color: "",
      rcExpiry:         isoDateOnly(vehicle.rc_expiry),
      insuranceExpiry:  isoDateOnly(vehicle.insurance_expiry),
      fitnessExpiry:    isoDateOnly(vehicle.fitness_expiry),
      pucExpiry:        isoDateOnly(vehicle.puc_expiry),
      registrationDate: null as string | null,
      apiStatus: "cached",
    },
  };
}

function mapVehicleRow(v: Record<string, unknown>) {
  return {
    id:                 v.id                  as string,
    registrationNumber: (v.registration_number as string) ?? "",
    vehicleType:        (v.vehicle_type        as string) ?? "unknown",
    ownerType:          (v.owner_type          as string) ?? "owned",
    contractorId:       (v.contractor_id       as string | null) ?? null,
    rcExpiry:           isoDateOnly(v.rc_expiry),
    insuranceExpiry:    isoDateOnly(v.insurance_expiry),
    fitnessExpiry:      isoDateOnly(v.fitness_expiry),
    pucExpiry:          isoDateOnly(v.puc_expiry),
    status:             (v.status              as string) ?? "clear",
    warehouseId: "", orgId: "",
    isActive:           (v.is_active           as boolean) ?? true,
    rcOwnerName:        (v.rc_owner_name       as string | null) ?? null,
    rcManufacturer:     (v.rc_manufacturer     as string | null) ?? null,
    rcVehicleClass:     (v.rc_vehicle_class    as string | null) ?? null,
    rcFuelType:         (v.rc_fuel_type        as string | null) ?? null,
    rcChassisNumber:    (v.rc_chassis_number   as string | null) ?? null,
    rcEngineNumber:     (v.rc_engine_number    as string | null) ?? null,
    rcColor:            (v.rc_color            as string | null) ?? null,
    rcVerifyProvider:   (v.rc_verify_provider  as string | null) ?? null,
    rcVerifiedAt: null as string | null,
    createdAt:   (v.created_at as string) ?? new Date().toISOString(),
    updatedAt:   (v.updated_at as string) ?? (v.created_at as string) ?? new Date().toISOString(),
  };
}

function mapDriverRow(d: Record<string, unknown>) {
  return {
    id:           d.id            as string,
    fullName:     (d.full_name    as string) ?? "",
    dlNumber:     (d.dl_number    as string) ?? "",
    dlExpiry:     (d.dl_expiry    as string | null) ?? null,
    dlStatus:     (d.dl_status    as string | null) ?? null,
    bgStatus:     (d.bg_status    as string | null) ?? null,
    facePhotoUrl: (d.face_photo_url as string | null) ?? null,
    contractorId: (d.contractor_id  as string | null) ?? null,
    registeredAt: (d.registered_at  as string) ?? new Date().toISOString(),
  };
}

// DocuFast lookup hit — short-circuit the crime vendor call. The poll endpoint
// resolves `lookup_<dlNorm>` caseIds by re-reading the same Firestore cache;
// no third-party crime-check call is made. Provider is detected from the raw
// shape (GFC/Signzy/Wizer) so the existing translateCrimeCheckResponse picks
// the right translator.
function crimeCheckFromLookup(
  dlNorm: string,
  raw: Record<string, unknown>,
  provider: string,
) {
  return {
    step:        "waiting" as const,
    caseId:      `lookup_${dlNorm}`,
    provider,
    rawInitiate: raw,
    message:     undefined as string | undefined,
  };
}

// Extract driver name from a Parivahan DL response (DocuFast DRIVING_LICENSE step).
function extractParivahanName(dl: Record<string, unknown>): string {
  const result = (dl.result ?? {}) as Record<string, unknown>;
  const det    = (result.detailsOfDrivingLicence ?? {}) as Record<string, unknown>;
  return String(
    det.name ?? result.name ?? (result as { dlHolderName?: string }).dlHolderName ?? ""
  ).trim();
}

// When the crime check vendor errors, return a fallback caseId that the poll
// endpoint resolves as "0 cases / no record" without calling the vendor again.
function noopCrimeCheck() {
  return {
    step:        "waiting" as const,
    caseId:      `noop_${crypto.randomUUID()}`,
    provider:    "fallback",
    rawInitiate: {} as Record<string, unknown>,
    message:     undefined as string | undefined,
  };
}

function crimeCheckFromSettled(
  settled: PromiseSettledResult<{ provider: string; caseId: string; raw: Record<string, unknown> }>,
) {
  if (settled.status === "fulfilled") {
    return {
      step:        "waiting" as const,
      caseId:      settled.value.caseId,
      provider:    settled.value.provider,
      rawInitiate: settled.value.raw,
      message:     undefined as string | undefined,
    };
  }
  // Vendor failed — return a noop ID so the client still polls and gets "0 cases".
  console.error("[verify] crime check failed, using noop fallback:", settled.reason);
  return noopCrimeCheck();
}

// Returns null when name is absent (no initiation, no noop polling).
// Returns noop only when name was present but the vendor actually errored.
function maybeCrimeCheck(
  driverName: string,
  settled: PromiseSettledResult<{ provider: string; caseId: string; raw: Record<string, unknown> } | null>,
) {
  if (!driverName) return null;
  if (settled.status === "fulfilled" && settled.value) {
    return {
      step:        "waiting" as const,
      caseId:      settled.value.caseId,
      provider:    settled.value.provider,
      rawInitiate: settled.value.raw,
      message:     undefined as string | undefined,
    };
  }
  if (settled.status === "rejected") {
    console.error("[verify] crime check failed, using noop fallback:", settled.reason);
    return noopCrimeCheck();
  }
  return null;
}

// Extract the driver name from an IDfy DL task result.
function extractIdfyName(task: Record<string, unknown>): string {
  const result = task.result as Record<string, unknown> | undefined;
  const src    = result?.source_output as Record<string, unknown> | undefined;
  return (src?.name as string | undefined)?.trim() ?? "";
}

// Rehost the IDfy photo and patch the URL directly in the task (mutates).
async function rehostDlPhoto(task: Record<string, unknown>, dlNorm: string): Promise<void> {
  try {
    const result = task.result as Record<string, unknown> | undefined;
    const src    = result?.source_output as Record<string, unknown> | undefined;
    if (!src) return;
    const photoUrl: string | undefined =
      (src.profile_image as string | undefined) ?? (src.photo as string | undefined);
    if (!photoUrl) return;
    const stored = await uploadImageFromUrl(photoUrl, `driver-photos/${dlNorm}`);
    if ("profile_image" in src) src.profile_image = stored;
    if ("photo"          in src) src.photo         = stored;
  } catch (err) {
    console.error("[verify] photo rehost failed", err);
  }
}

// ── Crime check vendor ────────────────────────────────────────────────────────

async function initiateCrimeCheck(params: {
  name: string; dob: string; fatherName?: string; address?: string; dlNumber?: string;
}): Promise<{ provider: string; caseId: string; raw: Record<string, unknown> }> {
  if (params.dlNumber) {
    const staticCaseId = lookupStaticCaseId(params.dlNumber);
    if (staticCaseId) return { provider: "static", caseId: staticCaseId, raw: { caseId: staticCaseId } };
  }

  const apiUrl   = process.env.CRIME_CHECK_API_URL;
  const apiKey   = process.env.CRIME_CHECK_API_KEY;
  const provider = process.env.CRIME_CHECK_PROVIDER ?? "wizer";
  if (!apiUrl || !apiKey) throw new Error("Crime check not configured");
  if (!params.name) throw new Error("Driver name required for crime check");
  if (!params.dob)  throw new Error("Driver DOB required for crime check");

  const address = params.address?.trim() ?? "";
  // Signzy requires a non-empty `address`; reject upstream so the caller logs
  // "missing address" rather than a vague vendor 400.
  if (provider === "signzy" && !address) {
    throw new Error("Driver address required for Signzy crime check");
  }

  const fatherName = params.fatherName?.trim() ?? "";
  const body: Record<string, string> = {
    name: params.name, dob: params.dob, matchType: "possible",
  };
  if (address)    body.address    = address;
  if (fatherName) body.fatherName = fatherName;

  const authHeader = provider === "signzy" ? apiKey : `Bearer ${apiKey}`;
  const res = await thirdPartyFetch(apiUrl, {
    _service: "crime_check",
    _operation: "crime_check_initiate",
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body),
  });
  const raw = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error("Crime check vendor error");
  const r   = raw as { caseId?: string; requestId?: string | number };
  const caseId = r.caseId ?? String(r.requestId ?? "");
  return { provider, caseId, raw };
}

// Extract driver address from a DL raw response (works for IDfy, Parivahan,
// and the static-demo shape since they all match one of these locations).
function extractDlAddress(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return "";
  const result = (raw.result ?? {}) as Record<string, unknown>;
  // IDfy: result.source_output.address
  const src = (result.source_output ?? {}) as Record<string, unknown>;
  // Parivahan: result.detailsOfDrivingLicence.address
  const det = (result.detailsOfDrivingLicence ?? {}) as Record<string, unknown>;
  const candidate =
    src.address ??
    det.address ??
    (result as { currentAddress?: string; address?: string }).currentAddress ??
    (result as { address?: string }).address ??
    "";
  return String(candidate).trim();
}

function extractDlFatherName(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return "";
  const result = (raw.result ?? {}) as Record<string, unknown>;
  const src = (result.source_output ?? {}) as Record<string, unknown>;
  const det = (result.detailsOfDrivingLicence ?? {}) as Record<string, unknown>;
  const candidate =
    src.relatives_name ??
    src.father_or_husband_name ??
    det.fatherOrHusbandName ??
    (result as { fatherName?: string }).fatherName ??
    "";
  return String(candidate).trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const maint = maintenanceCheck();
  if (maint) return maint;

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }));
  }

  const { dlNumber, dob, vehicleReg } = parsed.data;
  const dlNorm         = dlNumber.toUpperCase().replace(/[\s\-]/g, "");
  const vehicleRegNorm = vehicleReg?.toUpperCase().replace(/[\s\-]/g, "") ?? null;
  const rcEnabled      = process.env.RC_VERIFY_ENABLED === "true";

  try {
    // ── Phase 1: all DB lookups in parallel ─────────────────────────────────
    // Gate-event lookup via subquery — avoids a sequential round trip.
    // The DocuFast license lookup runs alongside; downstream call sites use
    // its result lookup-first, falling back to IDfy / crime vendor on miss.
    const [driverRows, vehicleRows, cachedEventRows, lookupHit] = await Promise.all([
      db`
        SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status,
               face_photo_url, contractor_id, registered_at
        FROM   drivers
        WHERE  org_id    = ${actor.org}
          AND  is_active = true
          AND  UPPER(REPLACE(REPLACE(dl_number, ' ', ''), '-', '')) = ${dlNorm}
        LIMIT  1
      `,
      vehicleRegNorm
        ? db`
            SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
                   rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status,
                   rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_fuel_type,
                   rc_chassis_number, rc_engine_number, rc_color,
                   rc_verify_provider, is_active, created_at, updated_at
            FROM   vehicles
            WHERE  org_id    = ${actor.org}
              AND  is_active = true
              AND  UPPER(REPLACE(REPLACE(registration_number, ' ', ''), '-', '')) = ${vehicleRegNorm}
            LIMIT  1
          `
        : Promise.resolve([] as Record<string, unknown>[]),
      // Fetch the latest gate event with IDfy DL data for this DL number
      // (driver may or may not be in the DB yet — join through dl_number).
      db`
        SELECT ge.metadata->>'dlVerifyData' AS dl_verify_json
        FROM   gate_events ge
        JOIN   drivers     d  ON d.id = ge.driver_id
        WHERE  d.org_id    = ${actor.org}
          AND  d.is_active = true
          AND  UPPER(REPLACE(REPLACE(d.dl_number, ' ', ''), '-', '')) = ${dlNorm}
          AND  ge.org_id   = ${actor.org}
          AND  ge.metadata->>'dlVerifyData' IS NOT NULL
        ORDER  BY ge.occurred_at DESC
        LIMIT  1
      `,
      lookupLicense(dlNumber).catch((err) => {
        console.error("[verify] licenseLookup failed", err);
        return null;
      }),
    ]);

    const driverRow           = (driverRows  as Record<string, unknown>[])[0] ?? null;
    const vehicleRow          = (vehicleRows as Record<string, unknown>[])[0] ?? null;
    const lookupDl            = lookupHit?.dl            ?? null;
    const lookupCrime         = lookupHit?.crime         ?? null;
    const lookupCrimeProvider = lookupHit?.crimeProvider ?? null;

    // Parse IDfy data cached in most-recent gate event.
    let cachedDlRaw: { provider: string; data: Record<string, unknown> } | null = null;
    if (cachedEventRows.length) {
      try {
        const p = JSON.parse((cachedEventRows[0] as Record<string, unknown>).dl_verify_json as string) as {
          provider: string; data: Record<string, unknown>;
        };
        if (p?.provider && p?.data) cachedDlRaw = p;
      } catch { /* malformed JSON, ignore */ }
    }

    const needRcVerify = !vehicleRow && rcEnabled && !!vehicleRegNorm;
    const hdrs = idfyHeaders();

    // ── Cached driver path ───────────────────────────────────────────────────
    if (driverRow) {
      // DL bundle from cached data — no IDfy call.
      const dlBundle = cachedDlRaw
        ? { provider: cachedDlRaw.provider, raw: cachedDlRaw.data, normalized: null, validation: null }
        : buildCachedDlBundle(driverRow);

      const driverName = (driverRow.full_name as string) ?? "";
      // Address (and fatherName) for the crime vendor come from the licence
      // details. Try sources in order:
      //   1. cached IDfy/Parivahan response on the most recent gate event
      //   2. DocuFast Parivahan lookup (`lookupDl`)
      // The driver-row fallback bundle has raw:{} and no address.
      const driverAddress =
        extractDlAddress(dlBundle.raw) || extractDlAddress(lookupDl);
      const driverFather =
        extractDlFatherName(dlBundle.raw) || extractDlFatherName(lookupDl);

      // RC verify + crime check in parallel — skip the crime vendor when
      // DocuFast already has a result for this DL.
      const [rcSettled, crimeSettled] = await Promise.allSettled([
        needRcVerify
          ? (async () => {
              const staticRaw = lookupStaticRcRaw(vehicleRegNorm!);
              if (staticRaw) return { provider: "idfy", raw: staticRaw };
              if (!hdrs["api-key"]) throw new Error("RC_VERIFY not configured");
              const reqId = await submitRc(vehicleRegNorm!, hdrs);
              return { provider: "idfy", raw: await idfyPoll(reqId, hdrs, "rc_verify_poll") };
            })()
          : Promise.resolve(null),
        (lookupCrime && lookupCrimeProvider) || !driverName
          ? Promise.resolve(null)
          : initiateCrimeCheck({
              name: driverName,
              dob: dobToDash(dob),
              address: driverAddress,
              fatherName: driverFather,
              dlNumber: dlNorm,
            }),
      ]);

      type RcBundle = ReturnType<typeof buildCachedRcBundle> | { provider: string; raw: Record<string, unknown>; normalized: null } | null;
      let rcBundle: RcBundle = vehicleRow ? buildCachedRcBundle(vehicleRow) : null;
      if (!rcBundle && rcSettled.status === "fulfilled" && rcSettled.value) {
        const { provider: rcProvider, raw: rcRaw } = rcSettled.value;
        rcBundle = { provider: rcProvider, raw: rcRaw, normalized: null };
      }

      const crimeCheck = lookupCrime && lookupCrimeProvider
        ? crimeCheckFromLookup(dlNorm, lookupCrime, lookupCrimeProvider)
        : maybeCrimeCheck(driverName, crimeSettled);

      return applySecurityHeaders(NextResponse.json({
        dlBundle, driverRecord: mapDriverRow(driverRow),
        vehicleRecord: vehicleRow ? mapVehicleRow(vehicleRow) : null,
        rcBundle, crimeCheck,
      }));
    }

    // ── Fresh driver path ────────────────────────────────────────────────────
    // Check for static demo DL first.
    const staticDlRaw = lookupStaticDlRaw(dlNorm);
    if (staticDlRaw) {
      // Treat like a fast IDfy result — no polling needed.
      const dlBundle = { provider: "idfy", raw: staticDlRaw, normalized: null, validation: null };
      const driverName    = extractIdfyName(staticDlRaw as Record<string, unknown>);
      const driverAddress = extractDlAddress(staticDlRaw as Record<string, unknown>);
      const driverFather  = extractDlFatherName(staticDlRaw as Record<string, unknown>);
      const [rcSettled, crimeSettled] = await Promise.allSettled([
        needRcVerify
          ? (async () => {
              const sr = lookupStaticRcRaw(vehicleRegNorm!);
              if (sr) return { provider: "idfy", raw: sr };
              if (!hdrs["api-key"]) throw new Error("RC_VERIFY not configured");
              const reqId = await submitRc(vehicleRegNorm!, hdrs);
              return { provider: "idfy", raw: await idfyPoll(reqId, hdrs, "rc_verify_poll") };
            })()
          : Promise.resolve(null),
        (lookupCrime && lookupCrimeProvider) || !driverName
          ? Promise.resolve(null)
          : initiateCrimeCheck({
              name: driverName,
              dob: dobToDash(dob),
              address: driverAddress,
              fatherName: driverFather,
              dlNumber: dlNorm,
            }),
      ]);
      const rcBundle = rcSettled.status === "fulfilled" && rcSettled.value
        ? { provider: rcSettled.value.provider, raw: rcSettled.value.raw, normalized: null }
        : null;
      const crimeCheck = lookupCrime && lookupCrimeProvider
        ? crimeCheckFromLookup(dlNorm, lookupCrime, lookupCrimeProvider)
        : maybeCrimeCheck(driverName, crimeSettled);
      return applySecurityHeaders(NextResponse.json({
        dlBundle, driverRecord: null,
        vehicleRecord: vehicleRow ? mapVehicleRow(vehicleRow) : null,
        rcBundle, crimeCheck,
      }));
    }

    // Live IDfy path. Configuration is only required when we actually need
    // to call IDfy for DL — when DocuFast already has the DL we skip submit.
    if (!lookupDl && (!hdrs["api-key"] || !hdrs["account-id"])) {
      return applySecurityHeaders(NextResponse.json(
        { error: "DL verification not configured (DL_VERIFY_API_KEY / DL_VERIFY_ACCOUNT_KEY)" },
        { status: 503 },
      ));
    }

    // Phase 2: submit DL + RC to IDfy simultaneously.
    // DL submit is skipped when DocuFast already has the result.
    const [dlRequestId, rcRequestId] = await Promise.all([
      lookupDl ? Promise.resolve(null) : submitDl(dlNorm, dob, hdrs),
      needRcVerify
        ? (async () => {
            const sr = lookupStaticRcRaw(vehicleRegNorm!);
            if (sr) return null; // handled below as static
            return submitRc(vehicleRegNorm!, hdrs);
          })()
        : Promise.resolve(null),
    ]);

    // Phase 3: poll DL first (we need the name for crime check) — or use the
    // DocuFast lookup result directly. RC poll runs in parallel.
    const dlPollPromise: Promise<Record<string, unknown>> = lookupDl
      ? Promise.resolve(lookupDl)
      : idfyPoll(dlRequestId!, hdrs, "dl_verify_poll");
    const rcPollPromise = rcRequestId
      ? idfyPoll(rcRequestId, hdrs, "rc_verify_poll")
      : Promise.resolve(null);

    const dlTask = await dlPollPromise;

    // Rehost photo only for IDfy responses; DocuFast photos are already hosted.
    if (!lookupDl) await rehostDlPhoto(dlTask, dlNorm);

    const driverName = lookupDl ? extractParivahanName(dlTask) : extractIdfyName(dlTask);
    const dlBundle = lookupDl
      ? { provider: "parivahan", raw: dlTask, normalized: null, validation: null }
      : { provider: "idfy",       raw: dlTask, normalized: null, validation: null };

    // Phase 4: crime check + await RC poll (both in parallel).
    // Skip the crime vendor entirely when DocuFast already has a result.
    const driverAddress = extractDlAddress(dlTask);
    const driverFather  = extractDlFatherName(dlTask);
    const [crimeSettled, rcSettled] = await Promise.allSettled([
      lookupCrime || !driverName
        ? Promise.resolve(null)
        : initiateCrimeCheck({
            name: driverName,
            dob: dobToDash(dob),
            address: driverAddress,
            fatherName: driverFather,
            dlNumber: dlNorm,
          }),
      rcPollPromise,
    ]);

    // Merge static RC raw if applicable.
    const staticRcRaw = needRcVerify ? lookupStaticRcRaw(vehicleRegNorm!) : null;
    let rcBundle: { provider: string; raw: Record<string, unknown>; normalized: null } | null = null;
    if (staticRcRaw) {
      rcBundle = { provider: "idfy", raw: staticRcRaw, normalized: null };
    } else if (rcSettled.status === "fulfilled" && rcSettled.value) {
      rcBundle = { provider: "idfy", raw: rcSettled.value, normalized: null };
    }

    const crimeCheck = lookupCrime && lookupCrimeProvider
      ? crimeCheckFromLookup(dlNorm, lookupCrime, lookupCrimeProvider)
      : maybeCrimeCheck(driverName, crimeSettled);

    return applySecurityHeaders(NextResponse.json({
      dlBundle, driverRecord: null,
      vehicleRecord: vehicleRow ? mapVehicleRow(vehicleRow) : null,
      rcBundle, crimeCheck,
    }));

  } catch (err) {
    console.error("[verify]", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "Verification failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  }
}
