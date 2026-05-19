import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";

// AES-256-GCM with per-org HKDF-derived subkeys.
// ENCRYPTION_MASTER_KEY must be a 64-char hex string (32 bytes).
const ALGORITHM = "aes-256-gcm" as const;

function masterKey(): Buffer {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_MASTER_KEY must be a 64-char hex string");
  }
  return Buffer.from(hex, "hex");
}

// HMAC-SHA256 used as the HKDF expand step for simplicity.
function deriveOrgKey(orgId: string): Buffer {
  return createHmac("sha256", masterKey())
    .update(`fleetguard:org:${orgId}`)
    .digest();
}

export function encrypt(plaintext: string, orgId: string): string {
  const key = deriveOrgKey(orgId);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Layout: iv(12 bytes) | tag(16 bytes) | ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string, orgId: string): string {
  const key = deriveOrgKey(orgId);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
