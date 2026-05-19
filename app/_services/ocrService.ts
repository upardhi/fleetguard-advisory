// app/_services/ocrService.ts
//
// Driving-licence OCR — IDfy async extract (`ind_driving_license`).
// SERVER ONLY — imports thirdPartyFetch which uses the Supabase server client.
//
// ENV
//   DL_VERIFY_API_KEY      shared with DL verify
//   DL_VERIFY_ACCOUNT_KEY  shared with DL verify
//
// In development, if the IDfy credentials aren't set, returns mock data so the
// rest of the flow can still be exercised. In production a missing credential
// throws.

import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";

// ── Result shape ───────────────────────────────────────────────────────────────

export interface LicenceOcrResult {
  dlNumber?: string;
  fullName?: string;
  fatherName?: string;
  dobDay?: string;      // "DD"  zero-padded
  dobMonth?: string;    // "MM"  zero-padded
  dobYear?: string;     // "YYYY"
  dateOfBirth?: string;
  address?: string;
  issuingAuthority?: string;
  dateOfIssue?: string;
  dateOfExpiry?: string;
  classOfVehicles?: string[];
  district?: string;
  pincode?: string;
  bloodGroup?: string;
  rawText?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const IDFY_API_KEY    = process.env.DL_VERIFY_API_KEY ?? '';
const IDFY_ACCOUNT_ID = process.env.DL_VERIFY_ACCOUNT_KEY ?? '';

const IDFY_SUBMIT_URL = 'https://eve.idfy.com/v3/tasks/async/extract/ind_driving_license';
const IDFY_TASKS_URL  = 'https://eve.idfy.com/v3/tasks';
const IDFY_POLL_INTERVAL_MS  = 1000;
const IDFY_POLL_MAX_ATTEMPTS = 30;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Process a File through DL OCR.
 * Safe to call server-side — uses arrayBuffer(), not FileReader.
 */
export async function processFileWithOCR(file: File): Promise<LicenceOcrResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return runOcr(buffer.toString('base64'));
}

/** Process an image URL through DL OCR. */
export async function processImageWithOCR(imageUrl: string): Promise<LicenceOcrResult> {
  const res    = await fetch(imageUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  return runOcr(buffer.toString('base64'));
}

/** Legacy base-64 entry point — kept for backwards compatibility. */
export async function extractLicenceData(imageBase64: string): Promise<LicenceOcrResult> {
  return runOcr(imageBase64);
}

async function runOcr(imageBase64: string): Promise<LicenceOcrResult> {
  if (!IDFY_API_KEY || !IDFY_ACCOUNT_ID) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[OCR] DL_VERIFY_API_KEY / DL_VERIFY_ACCOUNT_KEY not set — returning mock data (dev).');
      return devMockResult();
    }
    throw new Error('OCR not configured. Set DL_VERIFY_API_KEY and DL_VERIFY_ACCOUNT_KEY.');
  }
  return callIdfyOcr(imageBase64);
}

// ── IDfy call ─────────────────────────────────────────────────────────────────

interface IdfyTaskResponse {
  request_id: string;
}

interface IdfyExtractionOutput {
  address?: string;
  date_of_birth?: string;        // "YYYY-MM-DD"
  date_of_validity?: string;     // "YYYY-MM-DD"
  district?: string;
  fathers_name?: string;
  id_number?: string;
  is_scanned?: boolean;
  issue_dates?: { LMV?: string; MCWG?: string; TRANS?: string };
  name_on_card?: string;
  pincode?: string;
  state?: string;
  street_address?: string;
  type?: string[];
  validity?: { NT?: string; T?: string };
}

interface IdfyTaskRecord {
  status: 'completed' | 'failed' | 'in_progress' | string;
  error?: string;
  result?: { extraction_output?: IdfyExtractionOutput };
}

async function callIdfyOcr(imageBase64: string): Promise<LicenceOcrResult> {
  const taskId  = crypto.randomUUID();
  const groupId = crypto.randomUUID();

  const submitRes = await thirdPartyFetch(IDFY_SUBMIT_URL, {
    _service: 'idfy',
    _operation: 'dl_ocr_submit',
    _logRequestBody: { task_id: taskId, group_id: groupId, data: { document1: '[base64-redacted]' } },
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'account-id':   IDFY_ACCOUNT_ID,
      'api-key':      IDFY_API_KEY,
    },
    body: JSON.stringify({
      task_id:  taskId,
      group_id: groupId,
      data:     { document1: imageBase64 },
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`IDfy submit failed (${submitRes.status}): ${text}`);
  }

  const { request_id: requestId } = (await submitRes.json()) as IdfyTaskResponse;
  if (!requestId) throw new Error('IDfy submit returned no request_id');

  // Poll until completed/failed or timeout
  let task: IdfyTaskRecord | null = null;
  for (let attempt = 1; attempt <= IDFY_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, IDFY_POLL_INTERVAL_MS));

    const pollRes = await thirdPartyFetch(`${IDFY_TASKS_URL}?request_id=${requestId}`, {
      _service: 'idfy',
      _operation: 'dl_ocr_poll',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'account-id':   IDFY_ACCOUNT_ID,
        'api-key':      IDFY_API_KEY,
      },
    });

    if (!pollRes.ok) {
      // Transient errors shouldn't kill the poll loop — just log and retry.
      console.warn(`[OCR/idfy] poll ${attempt} HTTP ${pollRes.status}`);
      continue;
    }

    const tasks = (await pollRes.json()) as IdfyTaskRecord[];
    const current = Array.isArray(tasks) ? tasks[0] : null;
    if (!current) continue;

    if (current.status === 'completed') {
      task = current;
      break;
    }
    if (current.status === 'failed') {
      throw new Error(`IDfy extraction failed: ${current.error ?? 'unknown'}`);
    }
  }

  if (!task) {
    throw new Error(
      `IDfy extraction timed out after ${IDFY_POLL_MAX_ATTEMPTS}s for request ${requestId}`
    );
  }

  const output = task.result?.extraction_output;
  if (!output) {
    throw new Error('IDfy response missing result.extraction_output');
  }

  return mapIdfyToLicenceResult(output);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/** Pick the first non-empty value from a list of optional strings. */
function firstNonEmpty(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return undefined;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (matches the existing field contract). */
function isoToDmy(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function mapIdfyToLicenceResult(o: IdfyExtractionOutput): LicenceOcrResult {
  let dobDay: string | undefined;
  let dobMonth: string | undefined;
  let dobYear: string | undefined;
  if (o.date_of_birth) {
    const m = o.date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      dobYear  = m[1];
      dobMonth = m[2];
      dobDay   = m[3];
    }
  }

  return {
    dlNumber:         o.id_number || undefined,
    fullName:         o.name_on_card || undefined,
    fatherName:       o.fathers_name || undefined,
    dobDay,
    dobMonth,
    dobYear,
    dateOfBirth:      o.date_of_birth || undefined,
    address:          o.address || o.street_address || undefined,
    issuingAuthority: o.state || undefined,
    dateOfIssue:      isoToDmy(firstNonEmpty(o.issue_dates?.LMV, o.issue_dates?.MCWG, o.issue_dates?.TRANS)),
    dateOfExpiry:     isoToDmy(firstNonEmpty(o.validity?.NT, o.validity?.T, o.date_of_validity)),
    classOfVehicles:  o.type && o.type.length > 0 ? o.type : undefined,
    district:         o.district || undefined,
    pincode:          o.pincode || undefined,
    bloodGroup:       undefined, // IDfy DL extract does not return blood group
  };
}

// ── Dev mock ──────────────────────────────────────────────────────────────────

function devMockResult(): LicenceOcrResult {
  return {
    dlNumber:         'MH02-20190056789',
    fullName:         'MOCK DRIVER (DEV)',
    fatherName:       'MOCK FATHER',
    dobDay:           '15',
    dobMonth:         '06',
    dobYear:          '1990',
    dateOfBirth:      '1990-06-15',
    address:          '123 Test Colony, Mumbai, Maharashtra - 400001',
    issuingAuthority: 'Maharashtra',
    dateOfIssue:      '01/01/2019',
    dateOfExpiry:     '31/12/2029',
    classOfVehicles:  ['LMV', 'MCWG'],
    district:         'Mumbai',
    pincode:          '400001',
    bloodGroup:       'O+',
  };
}
