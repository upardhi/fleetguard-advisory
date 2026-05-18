import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/app/_server/auth/jwt";
import { revokeSession } from "@/app/_server/auth/sessions";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("fg_access")?.value;
    if (token) {
      const claims = await verifyToken(token);
      await revokeSession(claims.sid);
    }
  } catch { /* already expired or invalid — fine */ }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("fg_access", "", { maxAge: 0, path: "/" });
  res.cookies.set("fg_refresh", "", { maxAge: 0, path: "/" });
  return res;
}
