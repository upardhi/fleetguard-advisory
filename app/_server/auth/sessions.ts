import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import { signAccessToken, signRefreshToken, type JwtClaims } from "./jwt";

const REFRESH_TTL_DAYS = 7;

interface CreateSessionParams {
  userId: string;
  orgId: string;
  role: string;
  ip?: string;
  userAgent?: string;
  mfaVerified?: boolean;
  sessionId?: string;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export async function createSession(params: CreateSessionParams): Promise<SessionTokens> {
  const sessionId = params.sessionId ?? uuidv7();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const claims: Omit<JwtClaims, "iat" | "exp"> = {
    sub: params.userId,
    org: params.orgId,
    role: params.role,
    sid: sessionId,
    mfa: params.mfaVerified ?? false,
  };
  const [, accessToken, refreshToken] = await Promise.all([
    db`
      INSERT INTO sessions (id, user_id, org_id, ip, user_agent, mfa_verified, expires_at)
      VALUES (${sessionId}, ${params.userId}, ${params.orgId}, ${params.ip ?? null},
              ${params.userAgent ?? null}, ${params.mfaVerified ?? false}, ${expiresAt})
    `,
    signAccessToken(claims),
    signRefreshToken(sessionId, params.userId),
  ]);
  return { accessToken, refreshToken, sessionId };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}`;
}

export async function validateSession(sessionId: string): Promise<boolean> {
  const [row] = await db`
    SELECT id FROM sessions
    WHERE id = ${sessionId} AND revoked_at IS NULL AND expires_at > now()
    LIMIT 1
  `;
  return Boolean(row);
}
