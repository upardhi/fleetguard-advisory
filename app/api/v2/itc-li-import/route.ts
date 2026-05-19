import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/app/_server/db/client";
import { adminDb } from "@/app/_lib/firebaseAdmin";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { getUser } from "@/app/_server/auth/getUser";

// ── Schema ────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  warehouseId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(0).default(0),
  previewDl: z.string().min(1).optional(),
  importDl: z.string().min(1).optional(),
});

// ── ITC LI service-provider ID → name map ────────────────────────────────────

const SERVICE_PROVIDER_MAP: Record<string, string> = {
  "401187": "A L TRANS PRIVATE LIMITED",
  "403002": "ALLCARGO LOGISTICS LIMITED",
  "401146": "AMMAN TRANSPORTS",
  "402232": "AVADH SUPPLY CHAIN SOLUTIONS",
  "401468": "COSMO CARRYING PRIVATE LIMITED",
  "401414": "DELHIVERY LIMITED",
  "400199": "GEOFAST PRIVATE LIMITED",
  "400018": "INDIA CARRIERS PVT LTD",
  "402841": "JAMSHEDPUR TRANSPORT COMPANY LIMITED",
  "400141": "JSM LOGISTICS PVT. LTD.",
  "401136": "KAPOOR DIESELS GARAGE PVT LTD",
  "209935": "LSG & CO",
  "LSG": "LSG & CO",
  "402726": "M/S S K Transport Co",
  "402388": "OKAY LOGISTICS PRIVATE LIMITED",
  "400129": "OM LOGISTICS LTD",
  "402866": "OM LOGISTICS SUPPLY CHAIN PRIVATE LIMITED",
  "402836": "ONE POINT SUPPLY CHAIN SOLUTION",
  "402591": "ONMOVE LOGISTICS PRIVATE LIMITED",
  "402361": "PATANJALI PARIVAHAN PRIVATE LIMITED",
  "400556": "RCI LOGISTICS PVT LTD",
  "400506": "S. P. GOLDEN TRANSPORT PVT. LTD.",
  "400220": "SAFEXPRESS PRIVATE LIMITED",
  "402321": "SAFEXPRESS PRIVATE LIMITED",
  "402846": "SAKSHI FREIGHT CARRIERS",
  "401474": "SINGAL TRANSPORT CORPORATION",
  "401402": "SOUTHERN CARGO CARRIERS (INDIA)",
  "402819": "SREE KEERTHI TRANSPORT",
  "235939": "Sri Pragati Transports",
  "400233": "TIRUPATI LOGISTICS PVT. LTD",
  "400861": "VARUN LOGISTICS",
  "400637": "VAYUDOOT ROAD CARRIERS PVT LTD",
  "402707": "VINSUM AXPRESS INDIA PRIVATE LIMITED",
  "402817": "YRC LOGISTICS",
  "402891": "ZAST LOGISOLUTIONS PRIVATE LIMITED",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type FirestoreTs = Timestamp | { seconds: number } | { _seconds: number } | string | number | null | undefined;

function fsToDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === "object" && val !== null) {
    const v = val as Record<string, unknown>;
    if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val as string | number);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function fsToIso(val: FirestoreTs): string | null {
  const d = fsToDate(val);
  return d ? d.toISOString() : null;
}

interface ReportStep {
  id: string;
  type?: string;
  details?: string | Record<string, unknown>;
  [key: string]: unknown;
}

function parseStepDetails(step: ReportStep | undefined): Record<string, unknown> | null {
  if (!step?.details) return null;
  if (typeof step.details === "object") return step.details as Record<string, unknown>;
  try { return JSON.parse(step.details) as Record<string, unknown>; } catch { return null; }
}

function detectCrimeProvider(raw: Record<string, unknown> | null): "gfc" | "signzy" | "wizer" | null {
  if (!raw) return null;
  if ("numberOfCases" in raw || "caseDetails" in raw) return "gfc";
  if ("signzyTotalCases" in raw || "signzyTransformedResult" in raw) return "signzy";
  if ("cases" in raw && ("total" in raw || "status" in raw)) {
    const first = (raw as { cases?: unknown[] }).cases?.[0] as Record<string, unknown> | undefined;
    if (first && ("uniqCaseId" in first || "algoRisk" in first)) return "wizer";
    return "signzy";
  }
  return null;
}

// Produces dlVerifyData.data in the exact idfy shape the sample JSON shows.
function normalizeDlToIdfyShape(
  dlRawData: Record<string, unknown> | null,
  fallback: { dlNumber: string; driverName: string | null; licenseStatus: unknown },
  meta: { docId: string; entryTime: string; profileImage: string | null },
): Record<string, unknown> {
  let sourceOutput: Record<string, unknown>;

  if (dlRawData) {
    const result = (dlRawData.result ?? {}) as Record<string, unknown>;
    const det = (result.detailsOfDrivingLicence ?? {}) as Record<string, unknown>;
    const dlVal = (result.dlValidity ?? {}) as Record<string, Record<string, string>>;
    const transport = dlVal.transport ?? { from: "", to: "" };
    const nonTransport = dlVal.nonTransport ?? { from: "", to: "" };

    const badges = Array.isArray(result.badgeDetails)
      ? (result.badgeDetails as Record<string, unknown>[])
      : [];
    const covDetails: { category: null; cov: string; issue_date: string | null }[] =
      badges.flatMap((b) =>
        Array.isArray(b.classOfVehicle)
          ? (b.classOfVehicle as string[]).map((cov) => ({
            category: null as null,
            cov,
            issue_date: typeof b.badgeIssueDate === "string" && b.badgeIssueDate ? b.badgeIssueDate : null,
          }))
          : [],
      );
    if (Array.isArray(det.covDetails)) {
      for (const c of det.covDetails as Record<string, unknown>[]) {
        if (c.cov && !covDetails.find((x) => x.cov === c.cov)) {
          covDetails.push({ category: null, cov: String(c.cov), issue_date: c.issueDate ? String(c.issueDate) : null });
        }
      }
    }

    sourceOutput = {
      address: String(det.address ?? result.currentAddress ?? result.address ?? "") || null,
      badge_details: null,
      card_serial_no: null,
      city: null,
      cov_details: covDetails,
      date_of_issue: String(det.dateOfIssue ?? result.dateOfIssue ?? "") || null,
      date_of_last_transaction: null,
      dl_status: null,
      dob: String(result.dob ?? "") || null,
      face_image: null,
      gender: null,
      hazardous_valid_till: null,
      hill_valid_till: null,
      id_number: String(result.dlNumber ?? ""),
      is_minor: false,
      issuing_rto_name: String(det.issuingRtoName ?? result.issuingAuthority ?? result.rtoName ?? "") || null,
      last_transacted_at: null,
      name: String(det.name ?? result.dlHolderName ?? result.name ?? "") || null,
      nt_validity_from: nonTransport.from || null,
      nt_validity_to: nonTransport.to || null,
      profile_image: meta.profileImage,
      relatives_name: String(det.fatherOrHusbandName ?? result.fatherName ?? "") || null,
      source: "government_website",
      state: String(det.state ?? result.state ?? "") || null,
      status: "id_found",
      t_validity_from: transport.from || null,
      t_validity_to: transport.to || null,
    };
  } else {
    const ls = String(fallback.licenseStatus ?? "").toLowerCase();
    const isValid = ls === "valid";
    const isExpired = ls === "expired";

    sourceOutput = {
      address: null,
      badge_details: null,
      card_serial_no: null,
      city: null,
      cov_details: (isValid || isExpired) ? [{ category: null, cov: "HMV", issue_date: null }] : [],
      date_of_issue: null,
      date_of_last_transaction: null,
      dl_status: null,
      dob: null,
      face_image: null,
      gender: null,
      hazardous_valid_till: null,
      hill_valid_till: null,
      id_number: fallback.dlNumber,
      is_minor: false,
      issuing_rto_name: null,
      last_transacted_at: null,
      name: fallback.driverName,
      nt_validity_from: null,
      nt_validity_to: null,
      profile_image: meta.profileImage,
      relatives_name: null,
      source: "government_website",
      state: null,
      status: "id_found",
      t_validity_from: (isValid || isExpired) ? "01/01/2000" : null,
      t_validity_to: isValid ? "01/01/2099" : isExpired ? "01/01/2000" : null,
    };
  }

  return {
    action: "verify_with_source",
    completed_at: meta.entryTime,
    created_at: meta.entryTime,
    group_id: meta.docId,
    request_id: meta.docId,
    result: { source_output: sourceOutput },
    status: "completed",
    task_id: meta.docId,
    type: "ind_driving_license",
  };
}

// Extracts NT/T validity dates from a Parivahan DL report step into "DD/MM/YYYY".
function extractDlValidity(dlRawData: Record<string, unknown> | null): {
  dlTransportValidFrom: string | null; dlTransportValidTo: string | null;
  dlNonTransportValidFrom: string | null; dlNonTransportValidTo: string | null;
} {
  if (!dlRawData) return { dlTransportValidFrom: null, dlTransportValidTo: null, dlNonTransportValidFrom: null, dlNonTransportValidTo: null };
  const result = (dlRawData.result ?? {}) as Record<string, unknown>;
  const dlVal = (result.dlValidity ?? {}) as Record<string, Record<string, string>>;
  const transport = dlVal.transport ?? {};
  const nonTransport = dlVal.nonTransport ?? {};
  function toDisplay(s: string | undefined): string | null {
    if (!s) return null;
    // YYYY-MM-DD → DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; }
    return s || null;
  }
  return {
    dlTransportValidFrom: toDisplay(transport.from),
    dlTransportValidTo: toDisplay(transport.to),
    dlNonTransportValidFrom: toDisplay(nonTransport.from),
    dlNonTransportValidTo: toDisplay(nonTransport.to),
  };
}

function mapDlValidation(d: Record<string, unknown>): {
  status: string; label: string; blocking: boolean;
} {
  const licenseStatus = String(d.licenseStatus ?? "").toLowerCase();
  const verified = (d.dlVerificationResults as Record<string, unknown> | undefined)?.drivingLicenseVerification;
  // Expired must be checked before verified=true — a DL can be found in the
  // govt database but still be expired (Firebase stores both fields independently).
  if (licenseStatus === "expired") {
    return { status: "invalid_transport_expired", label: "Transport DL expired", blocking: true };
  }
  if (licenseStatus === "valid" || verified === true) {
    return { status: "valid", label: "Valid", blocking: false };
  }
  if (verified === false) {
    return { status: "invalid_no_record", label: "DL not found in govt database", blocking: true };
  }
  return { status: "inconclusive", label: "Could not verify — check manually", blocking: true };
}

// Parse "DD/MM/YYYY" to a Date. Returns null if unparseable.
function parseDdMmYyyy(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [d, m, y] = s.split("/").map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function mapCrimeStep(d: Record<string, unknown>): "initiating" | "waiting" | "polling" | "done" | "error" {
  const s = d.crimeCheckStatus ?? d.crimeVerificationStatus;
  if (s === "completed") return "done";
  if (s === "pending" || s === "initiated") return "waiting";
  // Historical migration records — treat unknown status as completed
  return "done";
}

function extractCrimeCases(raw: Record<string, unknown> | null, provider: string | null): unknown[] {
  if (!raw) return [];
  if (provider === "gfc") return Array.isArray(raw.caseDetails) ? raw.caseDetails : [];
  if (provider === "signzy") {
    if (Array.isArray(raw.signzyTransformedResult)) return raw.signzyTransformedResult;
    if (Array.isArray(raw.cases)) return raw.cases;
    return [];
  }
  if (provider === "wizer") return Array.isArray(raw.cases) ? raw.cases : [];
  if (Array.isArray(raw.cases)) return raw.cases;
  return [];
}

function istDayBounds(dateStr: string): { start: Date; end: Date } {
  const [y, m, day] = dateStr.split("-").map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, day, 0, 0, 0) - 5 * 3_600_000 - 30 * 60_000);
  return { start: startUtc, end: new Date(startUtc.getTime() + 86_400_000) };
}

function yesterdayISTStr(): string {
  const nowIst = new Date(Date.now() + 5 * 3_600_000 + 30 * 60_000);
  nowIst.setUTCDate(nowIst.getUTCDate() - 1);
  return nowIst.toISOString().slice(0, 10);
}

// ── POST ────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getUser(req);
    if (!user || !(["superadmin", "company_admin", "guard"] as string[]).includes(user.role)) {
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    let body: unknown;
    try { body = await req.json(); }
    catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return applySecurityHeaders(NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }));
    }

    const { warehouseId, date, limit, previewDl, importDl } = parsed.data;
    const dateStr = date ?? yesterdayISTStr();
    const { start, end } = istDayBounds(dateStr);

    // Resolve org from warehouse (read-only)
    const [wh] = await db`SELECT id, org_id, name FROM warehouses WHERE id = ${warehouseId} LIMIT 1`;
    if (!wh) return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
    const orgId = wh.org_id as string;

    // Fetch all contractors for this org once (read-only)
    const contractorRows = await db`SELECT id, name FROM contractors WHERE org_id = ${orgId}`;
    const contractorByName = new Map<string, { id: string; name: string }>();
    for (const c of contractorRows) {
      contractorByName.set((c.name as string).toUpperCase().trim(), { id: c.id as string, name: c.name as string });
    }

    // ── Preview mode: show normalized payload for a single DL without importing ──
    if (previewDl) {
      const compact = previewDl.toUpperCase().replace(/[\s\-]/g, "");
      const dashed4 = compact.match(/^([A-Z]{2}\d{2})(.+)$/);
      const dashed = dashed4 ? `${dashed4[1]}-${dashed4[2]}` : "";

      const attempts: Array<[string, string]> = [
        ["drivingLicenseUpper", compact],
        ["data.drivingLicense", dashed],
        ["data.drivingLicense", previewDl],
        ["data.drivingLicense", compact],
      ].filter(([, v]) => !!v) as Array<[string, string]>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let previewDoc: any | null = null;
      for (const [field, value] of attempts) {
        const snap2 = await adminDb.collection("verificationRequests").where(field, "==", value).limit(1).get();
        if (!snap2.empty) { previewDoc = snap2.docs[0]; break; }
      }

      if (!previewDoc) {
        return applySecurityHeaders(NextResponse.json({ error: "DL not found in Firebase", previewDl }, { status: 404 }));
      }

      const d = previewDoc.data();
      const steps: ReportStep[] = await (async () => {
        try {
          const rs = await adminDb.collection("reports").doc(previewDoc.id).collection("results").get();
          return rs.docs.map((s) => ({ id: s.id, ...s.data() }) as ReportStep);
        } catch { return []; }
      })();

      const dlStep = steps.find((s) => s.type === "DRIVING_LICENSE");
      const crimeRaw = parseStepDetails(steps.find((s) => s.type === "Signzy_Crime"))
        ?? parseStepDetails(steps.find((s) => s.type === "CRIME"))
        ?? (d.criminalData as Record<string, unknown> | undefined)
        ?? null;
      const dlRawData = parseStepDetails(dlStep);
      const dlRaw = String(d.data?.drivingLicense ?? d.drivingLicense ?? "");
      const dlNorm = dlRaw.toUpperCase().replace(/[\s\-]/g, "") || compact;
      const vehRaw = String(d.data?.vehicleNumber ?? d.vehicleNumber ?? "");
      const vehicleReg = vehRaw.toUpperCase().replace(/[\s\-]/g, "") || null;
      const outTime = fsToIso((d.outTime ?? (d.data as Record<string, unknown> | undefined)?.outTime ?? null) as FirestoreTs);
      if (!vehicleReg) {
        return applySecurityHeaders(NextResponse.json({ error: "Skipped — no vehicle number", previewDl }, { status: 422 }));
      }
      if (!outTime) {
        return applySecurityHeaders(NextResponse.json({ error: "Skipped — no out time", previewDl }, { status: 422 }));
      }
      const entryTime = fsToIso(d.createdAt as FirestoreTs) ?? new Date().toISOString();
      const facePhotoUrl = typeof d.driverPhoto === "string" && d.driverPhoto ? d.driverPhoto : null;
      let dlVal = mapDlValidation(d);
      const crimeStep = mapCrimeStep(d);
      const crimeTotal = typeof d.totalCrimeCases === "number" ? d.totalCrimeCases : 0;
      const dlValidity = extractDlValidity(dlRawData);
      if (dlVal.status === "valid") {
        const tExp = parseDdMmYyyy(dlValidity.dlTransportValidTo);
        if (tExp && new Date(entryTime) > tExp) {
          dlVal = { status: "invalid_transport_expired", label: "Transport DL expired", blocking: true };
        }
      }
      const driverName = String((d.driverName ?? dlNorm) || "Imported Driver") || "Imported Driver";
      const spId = typeof (d.data?.serviceProviderId ?? d.serviceProviderId) === "string"
        ? String(d.data?.serviceProviderId ?? d.serviceProviderId) : null;
      const spNameRaw = typeof (d.data?.contractorName ?? d.contractorName ?? d.serviceProviderName) === "string"
        ? String(d.data?.contractorName ?? d.contractorName ?? d.serviceProviderName).trim() : null;
      const mappedName = (spId ? SERVICE_PROVIDER_MAP[spId] : null) ?? spNameRaw;
      const dbContractor = mappedName ? (contractorByName.get(mappedName.toUpperCase().trim()) ?? null) : null;

      const gateEntryPayload = {
        idempotencyKey: `itc-li-import-${previewDoc.id}`,
        warehouseId,
        driverId: null,
        vehicleId: null,
        dlNumber: dlNorm,
        dlNumberDisplay: dlRaw || dlNorm,
        driverName,
        facePhotoUrl,
        dlImageUrl: null,
        dlValidationStatus: dlVal.status,
        dlValidationLabel: dlVal.label,
        dlValidationBlocking: dlVal.blocking,
        dlProvider: "idfy",
        dlVerifyData: {
          provider: "idfy",
          capturedAt: entryTime,
          data: normalizeDlToIdfyShape(
            dlRawData,
            { dlNumber: dlNorm, driverName: typeof d.driverName === "string" ? d.driverName : null, licenseStatus: d.licenseStatus },
            { docId: previewDoc.id, entryTime, profileImage: facePhotoUrl },
          ),
        },
        dlTransportValidTo: dlValidity.dlTransportValidTo,
        dlTransportValidFrom: dlValidity.dlTransportValidFrom,
        dlNonTransportValidTo: dlValidity.dlNonTransportValidTo,
        dlNonTransportValidFrom: dlValidity.dlNonTransportValidFrom,
        crimeStep,
        crimeProvider: detectCrimeProvider(crimeRaw) ?? (typeof d.crimeVerificationProvider === "string" ? d.crimeVerificationProvider : null),
        crimeCaseId: `itcli_${previewDoc.id}`,
        crimeTotal,
        crimeActiveCriminal: 0,
        crimeCheckedAt: fsToIso((d.completedAt ?? d.crimeCheckedAt ?? d.createdAt) as FirestoreTs),
        crimeInitiateData: {},
        crimePollData: crimeRaw ?? {},
        vehicleReg,
        vehicleType: "",
        rcExpiry: null, insuranceExpiry: null, fitnessExpiry: null, pucExpiry: null,
        rcOwnerName: "", rcManufacturer: "", rcVehicleClass: "", rcVerifyProvider: "idfy",
        contractorIds: dbContractor ? [dbContractor.id] : [],
        contractorName: mappedName,
        photoUrl: null,
        overrideReason: dlVal.blocking ? `DL override: ${dlVal.label}` : null,
        occurredAt: entryTime,
        suppressAlerts: true,
      };

      return applySecurityHeaders(NextResponse.json({
        ok: true,
        preview: true,
        itcliId: previewDoc.id,
        hasExitTime: !!outTime,
        outTime,
        contractorResolved: dbContractor !== null,
        gateEntryPayload,
        _raw: {
          firestoreDoc: d,
          reportSteps: steps,
        },
      }));
    }

    // ── importDl: import a single record looked up by DL number ──────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allDocs: any[];
    let totalInSource: number;

    if (importDl) {
      const compact2 = importDl.toUpperCase().replace(/[\s\-]/g, "");
      const dashed4b = compact2.match(/^([A-Z]{2}\d{2})(.+)$/);
      const dashed2 = dashed4b ? `${dashed4b[1]}-${dashed4b[2]}` : "";

      const dlAttempts: Array<[string, string]> = [
        ["drivingLicenseUpper", compact2],
        ["data.drivingLicense", dashed2],
        ["data.drivingLicense", importDl],
        ["data.drivingLicense", compact2],
      ].filter(([, v]) => !!v) as Array<[string, string]>;

      let importDoc = null;
      for (const [field, value] of dlAttempts) {
        const s2 = await adminDb.collection("verificationRequests").where(field, "==", value).limit(1).get();
        if (!s2.empty) { importDoc = s2.docs[0]; break; }
      }

      if (!importDoc) {
        return applySecurityHeaders(NextResponse.json({ error: "DL not found in Firebase", importDl }, { status: 404 }));
      }

      allDocs = [importDoc];
      totalInSource = 1;
      console.log(`[itc-li-import] importDl=${importDl} found docId=${importDoc.id}`);
    } else {
      console.log(`[itc-li-import] Fetching Firestore ${start.toISOString()} – ${end.toISOString()}`);
      const snap = await adminDb
        .collection("verificationRequests")
        .where("createdAt", ">=", Timestamp.fromDate(start))
        .where("createdAt", "<", Timestamp.fromDate(end))
        .get();
      totalInSource = snap.size;
      allDocs = limit > 0 ? snap.docs.slice(0, limit) : snap.docs;
    }

    // Batch-fetch reports/{id}/results for each doc to get DL + crime raw payloads
    const reportStepsMap = new Map<string, ReportStep[]>();
    await Promise.all(allDocs.map(async (doc) => {
      try {
        const rsnap = await adminDb.collection("reports").doc(doc.id).collection("results").get();
        reportStepsMap.set(doc.id, rsnap.docs.map((s) => ({ id: s.id, ...s.data() }) as ReportStep));
      } catch {
        reportStepsMap.set(doc.id, []);
      }
    }));

    // Derive base URL for internal API calls (same host, same scheme)
    const baseUrl = req.nextUrl.origin;
    const forwardCookie = req.headers.get("cookie") ?? "";

    // Build contractor resolution summary (which provider IDs resolve and which don't)
    const contractorSummary: Record<string, { mappedName: string | null; foundInDb: boolean; contractorId: string | null }> = {};

    type ImportResult = {
      itcliId: string;
      status: "imported" | "duplicate" | "failed" | "skipped";
      entryEventId: string | null;
      driverId: string | null;
      exitStatus: "skipped" | "created" | "failed" | null;
      error?: string;
      reason?: string;
    };

    let imported = 0, skipped = 0, failed = 0, duplicate = 0;
    const results: ImportResult[] = [];

    for (const doc of allDocs) {
      const d = doc.data();

      const dlRaw = String(d.data?.drivingLicense ?? d.drivingLicense ?? "");
      const dlNorm = dlRaw.toUpperCase().replace(/[\s\-]/g, "");
      const vehRaw = String(d.data?.vehicleNumber ?? d.vehicleNumber ?? "");
      const vehicleReg = vehRaw.toUpperCase().replace(/[\s\-]/g, "") || null;
      const outTime = fsToIso((d.outTime ?? (d.data as Record<string, unknown> | undefined)?.outTime ?? null) as FirestoreTs);
      if (!vehicleReg) {
        skipped++; results.push({
          itcliId: doc.id,
          status: "skipped",
          entryEventId: null,
          driverId: null,
          exitStatus: "skipped",
          reason: "no vehicle number",
        }); continue;
      }
      if (!outTime) {
        skipped++; results.push({
          itcliId: doc.id,
          status: "skipped",
          entryEventId: null,
          driverId: null,
          exitStatus: "skipped",
          reason: "no out time",
        }); continue;
      }

      // Service provider resolution
      const spId: string | null = (() => {
        const v = d.data?.serviceProviderId ?? d.serviceProviderId;
        return typeof v === "string" && v ? v : null;
      })();
      const spNameRaw: string | null = (() => {
        const v = d.data?.contractorName ?? d.contractorName ?? d.serviceProviderName;
        return typeof v === "string" && v.trim() ? v.trim() : null;
      })();

      // Resolve: map ID → canonical name, fall back to raw doc name
      const mappedName: string | null = (spId ? SERVICE_PROVIDER_MAP[spId] : null) ?? spNameRaw;
      const dbContractor = mappedName ? (contractorByName.get(mappedName.toUpperCase().trim()) ?? null) : null;

      // Accumulate summary per unique spId
      const summaryKey = spId ?? (spNameRaw ?? "unknown");
      if (!contractorSummary[summaryKey]) {
        contractorSummary[summaryKey] = {
          mappedName,
          foundInDb: dbContractor !== null,
          contractorId: dbContractor?.id ?? null,
        };
      }

      const steps = reportStepsMap.get(doc.id) ?? [];
      const dlStep = steps.find((s) => s.type === "DRIVING_LICENSE");
      const crimeRaw = parseStepDetails(steps.find((s) => s.type === "Signzy_Crime"))
        ?? parseStepDetails(steps.find((s) => s.type === "CRIME"))
        ?? (d.criminalData as Record<string, unknown> | undefined)
        ?? null;

      const dlRawData = parseStepDetails(dlStep);
      const resolvedCrimeProvider = detectCrimeProvider(crimeRaw)
        ?? (typeof d.crimeVerificationProvider === "string" ? d.crimeVerificationProvider : null);

      let dlVal = mapDlValidation(d);
      const crimeStep = mapCrimeStep(d);
      const crimeTotal = typeof d.totalCrimeCases === "number" ? d.totalCrimeCases : 0;
      const entryTime = fsToIso(d.createdAt as FirestoreTs) ?? new Date().toISOString();
      const facePhotoUrl = typeof d.driverPhoto === "string" && d.driverPhoto ? d.driverPhoto : null;
      const dlValidity = extractDlValidity(dlRawData);
      if (dlVal.status === "valid") {
        const tExp = parseDdMmYyyy(dlValidity.dlTransportValidTo);
        if (tExp && new Date(entryTime) > tExp) {
          dlVal = { status: "invalid_transport_expired", label: "Transport DL expired", blocking: true };
        }
      }
      const driverName = String((d.driverName ?? dlNorm) || "Imported Driver") || "Imported Driver";

      const dlVerifyDataObj = {
        provider: "idfy",
        capturedAt: entryTime,
        data: normalizeDlToIdfyShape(
          dlRawData,
          { dlNumber: dlNorm, driverName: typeof d.driverName === "string" ? d.driverName : null, licenseStatus: d.licenseStatus },
          { docId: doc.id, entryTime, profileImage: facePhotoUrl },
        ),
      };

      const gateEntryPayload = {
        idempotencyKey: `itc-li-import-${doc.id}`,
        warehouseId,
        driverId: null,
        vehicleId: null,

        dlNumber: dlNorm,
        dlNumberDisplay: dlRaw || dlNorm,
        driverName,
        facePhotoUrl,
        dlImageUrl: null,

        dlValidationStatus: dlVal.status,
        dlValidationLabel: dlVal.label,
        dlValidationBlocking: dlVal.blocking,
        dlProvider: "idfy",
        dlVerifyData: dlVerifyDataObj,

        dlTransportValidTo: dlValidity.dlTransportValidTo,
        dlTransportValidFrom: dlValidity.dlTransportValidFrom,
        dlNonTransportValidTo: dlValidity.dlNonTransportValidTo,
        dlNonTransportValidFrom: dlValidity.dlNonTransportValidFrom,

        crimeStep,
        crimeProvider: resolvedCrimeProvider,
        crimeCaseId: `itcli_${doc.id}`,
        crimeTotal,
        crimeActiveCriminal: 0,
        crimeCheckedAt: fsToIso((d.completedAt ?? d.crimeCheckedAt ?? d.createdAt) as FirestoreTs),
        crimeInitiateData: {},
        crimePollData: crimeRaw ?? {},

        vehicleReg,
        vehicleType: "",
        rcExpiry: null,
        insuranceExpiry: null,
        fitnessExpiry: null,
        pucExpiry: null,
        rcOwnerName: "",
        rcManufacturer: "",
        rcVehicleClass: "",
        rcVerifyProvider: "idfy",

        contractorIds: dbContractor ? [dbContractor.id] : [],
        contractorName: mappedName,

        photoUrl: null,
        overrideReason: dlVal.blocking ? `DL override: ${dlVal.label}` : null,
        occurredAt: entryTime,
        suppressAlerts: true,
      };

      // ── 1. POST /api/v2/gate-entry ─────────────────────────────────────────
      let entryEventId: string | null = null;
      let resolvedDriverId: string | null = null;
      let isDuplicate = false;

      try {
        const entryRes = await fetch(`${baseUrl}/api/v2/gate-entry`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: forwardCookie },
          body: JSON.stringify(gateEntryPayload),
        });

        if (entryRes.status === 200) {
          // Duplicate detected (idempotency key already used)
          const entryBody = await entryRes.json() as Record<string, unknown>;
          entryEventId = (entryBody.eventId as string | undefined) ?? null;
          isDuplicate = (entryBody.duplicate as boolean | undefined) ?? true;
        } else if (entryRes.status === 201) {
          const entryBody = await entryRes.json() as Record<string, unknown>;
          entryEventId = entryBody.eventId as string;
          resolvedDriverId = entryBody.driverId as string | null ?? null;
        } else {
          const errBody = await entryRes.text();
          throw new Error(`gate-entry ${entryRes.status}: ${errBody}`);
        }
      } catch (err) {
        failed++;
        results.push({
          itcliId: doc.id, status: "failed", entryEventId: null, driverId: null,
          exitStatus: null, error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (isDuplicate && entryEventId) {
        // Still need driver_id to create the exit event if it was skipped on the
        // first import run (e.g. no outTime then, defaulted now).
        const [existingEvt] = await db`SELECT driver_id FROM gate_events WHERE id = ${entryEventId} AND org_id = ${orgId} LIMIT 1`;
        resolvedDriverId = (existingEvt?.driver_id as string | null) ?? null;
      }

      // ── 2. Exit event ─────────────────────────────────────────────────────────
      // Create exit whenever outTime is present — no gap check.
      // Records with no outTime are left as "inside".
      const effectiveOutTime = outTime ?? null;
      const validExit = effectiveOutTime !== null;
      let exitStatus: ImportResult["exitStatus"] = validExit ? "failed" : "skipped";

      if (validExit && entryEventId) {
        try {
          const exitPayload = {
            warehouseId,
            eventType: "contractor_exit",
            vehicleReg: vehicleReg ?? null,
            personName: driverName,
            contractorName: mappedName ?? null,
            tripId: null,
            driverId: resolvedDriverId,
            photoUrl: null,
            status: "exited",
            occurredAt: effectiveOutTime,
            metadata: {
              overrideReason: null,
              overriddenByUid: null,
              entryEventId,
              dlVerifyData: dlVerifyDataObj,
              crimeCheckData: null,
            },
          };

          const exitRes = await fetch(`${baseUrl}/api/v2/gate-events`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: forwardCookie,
              "idempotency-key": `itc-li-import-exit-${doc.id}`,
            },
            body: JSON.stringify(exitPayload),
          });

          if (!exitRes.ok) {
            const errBody = await exitRes.text();
            throw new Error(`gate-events POST ${exitRes.status}: ${errBody}`);
          }

          // PATCH the entry event to mark it exited
          const patchRes = await fetch(`${baseUrl}/api/v2/gate-events/${entryEventId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json", cookie: forwardCookie },
            body: JSON.stringify({ status: "exited" }),
          });

          if (!patchRes.ok) {
            const errBody = await patchRes.text();
            throw new Error(`gate-events PATCH ${patchRes.status}: ${errBody}`);
          }

          exitStatus = "created";
        } catch (err) {
          exitStatus = "failed";
          console.error(`[itc-li-import] exit failed for ${doc.id}:`, err);
        }
      }

      if (isDuplicate) {
        duplicate++;
        results.push({ itcliId: doc.id, status: "duplicate", entryEventId, driverId: resolvedDriverId, exitStatus });
      } else {
        imported++;
        results.push({ itcliId: doc.id, status: "imported", entryEventId, driverId: resolvedDriverId, exitStatus });
      }
    }

    // Separate unresolved providers so caller knows what needs fixing
    const unresolvedProviders = Object.entries(contractorSummary)
      .filter(([, v]) => !v.foundInDb)
      .map(([spId, v]) => ({ spId, mappedName: v.mappedName }));

    return applySecurityHeaders(NextResponse.json({
      ok: true,
      date: dateStr,
      warehouseId,
      warehouseName: wh.name,
      orgId,
      totalInSource,
      processed: allDocs.length,
      imported,
      skipped,
      duplicate,
      failed,
      ...(limit > 0 && { limitApplied: limit }),
      contractorSummary,
      ...(unresolvedProviders.length > 0 && { unresolvedProviders }),
      results,
    }));

  } catch (err) {
    console.error("[itc-li-import] error:", err);
    return applySecurityHeaders(NextResponse.json(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    ));
  }
}
