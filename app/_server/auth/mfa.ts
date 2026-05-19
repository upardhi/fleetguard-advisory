import { authenticator } from "otplib";
import { randomBytes } from "crypto";
import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import { encrypt, decrypt } from "../db/encryption";

authenticator.options = { window: 1, digits: 6, step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function getTotpUri(secret: string, email: string): string {
  return authenticator.keyuri(email, "FleetGuard", secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase(),
  );
}

// Stores an unverified TOTP credential; caller must confirm with verifyTotp
// then mark verified = true to activate it.
export async function enrollTotp(
  userId: string,
  orgId: string,
): Promise<{ credentialId: string; secret: string; uri: string }> {
  const [user] = await db`SELECT email FROM users WHERE id = ${userId}`;
  if (!user) throw new Error("User not found");

  const secret = generateTotpSecret();
  const credentialId = uuidv7();

  await db`
    INSERT INTO mfa_credentials (id, user_id, type, secret, label, verified)
    VALUES (
      ${credentialId},
      ${userId},
      'totp',
      ${encrypt(secret, orgId)},
      'Authenticator app',
      false
    )
    ON CONFLICT DO NOTHING
  `;

  return {
    credentialId,
    secret,
    uri: getTotpUri(secret, user.email as string),
  };
}

export async function getVerifiedTotpSecret(
  userId: string,
  orgId: string,
): Promise<string | null> {
  const [cred] = await db`
    SELECT secret FROM mfa_credentials
    WHERE  user_id = ${userId} AND type = 'totp' AND verified = true
    LIMIT  1
  `;
  if (!cred) return null;
  return decrypt(cred.secret as string, orgId);
}
