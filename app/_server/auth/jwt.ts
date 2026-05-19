import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface JwtClaims extends JWTPayload {
  sub: string;   // userId
  org: string;   // orgId
  role: string;
  sid: string;   // sessionId
  mfa: boolean;  // MFA step completed
}

const ACCESS_TTL_S  = 5 * 24 * 60 * 60;           // 5 days
const REFRESH_TTL_S = 7 * 24 * 60 * 60; // 7 days

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error("JWT_SECRET must be at least 64 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: Omit<JwtClaims, "iat" | "exp">,
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .sign(jwtSecret());
}

export async function signRefreshToken(
  sessionId: string,
  userId: string,
): Promise<string> {
  return new SignJWT({ sub: userId, sid: sessionId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_S}s`)
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, jwtSecret());
  return payload as JwtClaims;
}

export const ACCESS_COOKIE_MAX_AGE  = ACCESS_TTL_S;
export const REFRESH_COOKIE_MAX_AGE = REFRESH_TTL_S;
