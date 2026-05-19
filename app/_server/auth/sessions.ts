import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import {
  signAccessToken,
  signRefreshToken,
  type JwtClaims,
} from "./jwt";

const REFRESH_TTL_DAYS = 7;

interface CreateSessionParams {
  userId: string;
  orgId: string;
  role: string;
  ip?: string;
  userAgent?: string;
  mfaVerified?: boolean;
  /**
   * Optional pre-generated session id. Callers that need to issue parallel
   * writes referencing the session (e.g. audit events) can generate the id
   * upfront with `uuidv7()` and pass it in.
   */
  sessionId?: string;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export async function createSession(
  params: CreateSessionParams,
): Promise<SessionTokens> {
  const sessionId = params.sessionId ?? uuidv7();
  const expiresAt = new Date(
    Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const claims: Omit<JwtClaims, "iat" | "exp"> = {
    sub: params.userId,
    org: params.orgId,
    role: params.role,
    sid: sessionId,
    mfa: params.mfaVerified ?? false,
  };

  // INSERT and JWT signing are independent — run them in parallel.
  const [, accessToken, refreshToken] = await Promise.all([
    db`
      INSERT INTO sessions (id, user_id, org_id, ip, user_agent, mfa_verified, expires_at)
      VALUES (
        ${sessionId},
        ${params.userId},
        ${params.orgId},
        ${params.ip ?? null},
        ${params.userAgent ?? null},
        ${params.mfaVerified ?? false},
        ${expiresAt}
      )
    `,
    signAccessToken(claims),
    signRefreshToken(sessionId, params.userId),
  ]);

  return { accessToken, refreshToken, sessionId };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db`
    UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}
  `;
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db`
    UPDATE sessions
    SET    revoked_at = now()
    WHERE  user_id = ${userId} AND revoked_at IS NULL
  `;
}

export async function validateSession(sessionId: string): Promise<boolean> {
  const [row] = await db`
    SELECT id FROM sessions
    WHERE  id = ${sessionId}
      AND  revoked_at IS NULL
      AND  expires_at > now()
    LIMIT  1
  `;
  return Boolean(row);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db`
    DELETE FROM sessions
    WHERE  expires_at < now() OR revoked_at IS NOT NULL
    RETURNING id
  `;
  return result.length;
}
