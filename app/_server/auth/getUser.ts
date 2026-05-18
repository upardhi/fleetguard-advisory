import { cookies } from "next/headers";
import { verifyToken, type JwtClaims } from "./jwt";
import { validateSession } from "./sessions";

export async function getUser(req?: Request): Promise<JwtClaims | null> {
  try {
    let token: string | undefined;
    if (req) {
      const auth = req.headers.get("authorization");
      if (auth?.startsWith("Bearer ")) token = auth.slice(7);
    }
    if (!token) {
      const jar = await cookies();
      token = jar.get("fg_access")?.value;
    }
    if (!token) return null;
    const claims = await verifyToken(token);
    const valid = await validateSession(claims.sid);
    return valid ? claims : null;
  } catch {
    return null;
  }
}

export async function requireUser(req?: Request): Promise<JwtClaims> {
  const user = await getUser(req);
  if (!user) throw Object.assign(new Error("Unauthorized"), { code: 401 });
  return user;
}
