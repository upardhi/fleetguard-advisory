import { createHash } from "crypto";
import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";

export function hashRequest(
  method: string,
  path: string,
  body: unknown,
): string {
  return createHash("sha256")
    .update(`${method}:${path}:${JSON.stringify(body)}`)
    .digest("hex");
}

export async function getIdempotentResponse(
  orgId: string,
  key: string,
): Promise<{ status: number; body: unknown } | null> {
  const [row] = await db`
    SELECT response_status, response_body
    FROM   idempotency_keys
    WHERE  org_id = ${orgId} AND key = ${key} AND expires_at > now()
    LIMIT  1
  `;
  if (!row) return null;
  return {
    status: row.response_status as number,
    body: row.response_body,
  };
}

export async function storeIdempotentResponse(
  orgId: string,
  key: string,
  requestHash: string,
  status: number,
  body: unknown,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db`
    INSERT INTO idempotency_keys
      (id, org_id, key, request_hash, response_status, response_body, expires_at)
    VALUES
      (${uuidv7()}, ${orgId}, ${key}, ${requestHash}, ${status},
       ${db.json(body as Parameters<typeof db.json>[0])}, ${expiresAt})
    ON CONFLICT (org_id, key) DO NOTHING
  `;
}

export async function cleanupIdempotencyKeys(): Promise<void> {
  await db`DELETE FROM idempotency_keys WHERE expires_at < now()`;
}
