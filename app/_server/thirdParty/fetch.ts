/**
 * thirdPartyFetch — SERVER ONLY.
 *
 * Drop-in replacement for native `fetch` when calling external vendors.
 * Automatically logs every request + response to fg_api_logs, fire-and-forget.
 *
 * Usage:
 *   import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";
 *
 *   const res = await thirdPartyFetch("https://eve.idfy.com/...", {
 *     _service:   "idfy",
 *     _operation: "dl_verify_submit",
 *     method:     "POST",
 *     headers:    { ... },
 *     body:       JSON.stringify(payload),
 *   });
 *
 * The two extra fields (_service, _operation) are stripped before the real
 * fetch call so the underlying API never sees them.
 *
 * Auth headers and URL query-params matching /key|token|secret|auth|api/i
 * are redacted before being stored.
 */

import { logThirdPartyCall } from "./logger";

export interface ThirdPartyFetchInit extends RequestInit {
  _service: string;
  _operation: string;
  /** Override what is stored in the log's request_body field (e.g. to redact large binary/base64 payloads). */
  _logRequestBody?: unknown;
}

const REDACTED = "[redacted]";
const SENSITIVE_HEADER_RE = /^(api[-_]?key|account[-_]?id|authkey|authorization|x-api-key)$/i;
const SENSITIVE_PARAM_RE  = /key|token|secret|auth|api/i;
const MAX_BODY_CHARS       = 10_000;

function sanitizeHeaders(
  raw: HeadersInit | undefined,
): Record<string, string> {
  if (!raw) return {};
  const entries =
    raw instanceof Headers
      ? Array.from(raw.entries())
      : Object.entries(raw as Record<string, string>);
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    out[k] = SENSITIVE_HEADER_RE.test(k) ? REDACTED : v;
  }
  return out;
}

function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.forEach((_, key) => {
      if (SENSITIVE_PARAM_RE.test(key)) u.searchParams.set(key, REDACTED);
    });
    return u.toString();
  } catch {
    return url;
  }
}

function tryParseBody(raw: BodyInit | null | undefined): unknown {
  if (!raw) return undefined;
  const str = typeof raw === "string" ? raw : String(raw);
  try {
    return JSON.parse(str);
  } catch {
    return str.length > MAX_BODY_CHARS ? str.slice(0, MAX_BODY_CHARS) + "…" : str;
  }
}

function tryParseText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) + "…" : text;
  }
}

export async function thirdPartyFetch(
  url: string,
  options: ThirdPartyFetchInit,
): Promise<Response> {
  const { _service, _operation, _logRequestBody, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  const cleanUrl = sanitizeUrl(url);
  const requestBody =
    _logRequestBody !== undefined
      ? _logRequestBody
      : { headers: sanitizeHeaders(fetchOptions.headers), body: tryParseBody(fetchOptions.body) };

  const start = Date.now();

  try {
    const res = await fetch(url, fetchOptions);
    const durationMs = Date.now() - start;

    // Clone so the caller can still consume the body normally.
    const clone = res.clone();
    const text = await clone.text().catch(() => "");

    logThirdPartyCall({
      service: _service,
      operation: _operation,
      method,
      url: cleanUrl,
      requestBody,
      responseStatus: res.status,
      responseBody: tryParseText(text),
      durationMs,
      success: res.ok,
    });

    return res;
  } catch (err) {
    const durationMs = Date.now() - start;

    logThirdPartyCall({
      service: _service,
      operation: _operation,
      method,
      url: cleanUrl,
      requestBody,
      durationMs,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    throw err;
  }
}
