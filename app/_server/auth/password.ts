import bcrypt from "bcrypt";
import { randomInt } from "node:crypto";
import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";

const BCRYPT_ROUNDS  = 12;
const HISTORY_DEPTH  = 12;

const TEMP_PW_UPPER   = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // no I, O — visually ambiguous
const TEMP_PW_LOWER   = "abcdefghijkmnopqrstuvwxyz";  // no l
const TEMP_PW_DIGITS  = "23456789";                   // no 0, 1
const TEMP_PW_SYMBOLS = "!@#$%^&*";

/**
 * Generates a 12-char temporary password guaranteed to satisfy
 * validatePasswordStrength(): one upper, one lower, one digit, one symbol,
 * remaining chars from the union, all positions shuffled.
 *
 * Uses node:crypto.randomInt for cryptographic randomness — Math.random()
 * isn't fit for credential material.
 */
export function generateTempPassword(length = 12): string {
  if (length < 8) length = 8;
  const all = TEMP_PW_UPPER + TEMP_PW_LOWER + TEMP_PW_DIGITS + TEMP_PW_SYMBOLS;
  const pick = (set: string) => set.charAt(randomInt(0, set.length));
  const required = [
    pick(TEMP_PW_UPPER), pick(TEMP_PW_LOWER),
    pick(TEMP_PW_DIGITS), pick(TEMP_PW_SYMBOLS),
  ];
  const remaining = Array.from({ length: length - required.length }, () => pick(all));
  const chars = [...required, ...remaining];
  // Fisher–Yates shuffle so the required positions aren't predictable.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function recordPasswordHistory(
  userId: string,
  hash: string,
): Promise<void> {
  await db`
    INSERT INTO password_history (id, user_id, hash)
    VALUES (${uuidv7()}, ${userId}, ${hash})
  `;
}

// Returns true if the password is NOT in the last HISTORY_DEPTH hashes.
export async function checkPasswordNotReused(
  userId: string,
  newPassword: string,
): Promise<boolean> {
  const rows = await db`
    SELECT hash FROM password_history
    WHERE  user_id = ${userId}
    ORDER  BY created_at DESC
    LIMIT  ${HISTORY_DEPTH}
  `;
  for (const { hash } of rows) {
    if (await bcrypt.compare(newPassword, hash as string)) return false;
  }
  return true;
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8)            return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password))        return "Must include an uppercase letter";
  if (!/[a-z]/.test(password))        return "Must include a lowercase letter";
  if (!/[0-9]/.test(password))        return "Must include a digit";
  if (!/[^A-Za-z0-9]/.test(password)) return "Must include a special character";
  return null;
}
