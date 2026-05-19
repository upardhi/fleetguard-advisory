/**
 * Third-party API call logger — SERVER ONLY.
 *
 * All inserts are fire-and-forget: the caller does not await and logging
 * failures are swallowed so they never affect the primary request.
 *
 * Usage:
 *   logThirdPartyCall({ service: 'idfy', operation: 'dl_verify_submit', ... })
 *   // do NOT await — intentionally fire-and-forget
 */

import { db } from "@/app/_server/db/client";

export interface ApiLogParams {
  service: string;
  operation: string;
  method: string;
  url: string;
  requestBody?: unknown;
  responseStatus?: number;
  responseBody?: unknown;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

export function logThirdPartyCall(params: ApiLogParams): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqBody = params.requestBody !== undefined ? db.json(params.requestBody as any) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resBody = params.responseBody !== undefined ? db.json(params.responseBody as any) : null;

  void db`
    INSERT INTO fg_api_logs
      (service, operation, method, url, request_body, response_status,
       response_body, duration_ms, success, error_message)
    VALUES
      (${params.service}, ${params.operation}, ${params.method}, ${params.url},
       ${reqBody}, ${params.responseStatus ?? null},
       ${resBody}, ${params.durationMs}, ${params.success},
       ${params.errorMessage ?? null})
  `.catch((err: unknown) => {
    // Never let a logging failure surface to callers.
    console.error(
      "[api-log] write failed:",
      err instanceof Error ? err.message : String(err),
    );
  });
}
