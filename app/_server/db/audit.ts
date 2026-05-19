import { createHash } from "crypto";
import { db } from "./client";
import { uuidv7 } from "./uuidv7";

export interface AuditEventInput {
  orgId: string | null;
  actorId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  warehouseId?: string | null;
  ip?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}

// SHA-256 over pipe-delimited fields produces the per-org hash chain.
// "genesis" is the sentinel prev_hash for the first event in an org.
function computeHash(fields: string[]): string {
  return createHash("sha256").update(fields.join("|")).digest("hex");
}

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  const id = uuidv7();
  const occurredAt = new Date();
  const payload = input.payload ?? {};

  const [prev] = input.orgId === null
    ? await db`
        SELECT hash
        FROM   audit_events
        WHERE  org_id IS NULL
        ORDER  BY occurred_at DESC
        LIMIT  1
      `
    : await db`
        SELECT hash
        FROM   audit_events
        WHERE  org_id = ${input.orgId}
        ORDER  BY occurred_at DESC
        LIMIT  1
      `;

  const prevHash = (prev?.hash as string) ?? "genesis";

  const hash = computeHash([
    id,
    input.orgId ?? "",
    input.actorId ?? "",
    input.action,
    input.resourceType,
    input.resourceId ?? "",
    JSON.stringify(payload),
    prevHash,
  ]);

  await db`
    INSERT INTO audit_events (
      id, org_id, actor_id, actor_role, action, resource_type, resource_id,
      warehouse_id, ip, user_agent, payload, prev_hash, hash, occurred_at
    ) VALUES (
      ${id},
      ${input.orgId},
      ${input.actorId ?? null},
      ${input.actorRole ?? null},
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null},
      ${input.warehouseId ?? null},
      ${input.ip ?? null},
      ${input.userAgent ?? null},
      ${db.json(payload as Parameters<typeof db.json>[0])},
      ${prevHash},
      ${hash},
      ${occurredAt}
    )
  `;
}
