import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/app/_server/auth/getUser";
import { revokeSession } from "@/app/_server/auth/sessions";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getUser(req);

  if (user) {
    await Promise.all([
      revokeSession(user.sid),
      writeAuditEvent({
        orgId: user.org,
        actorId: user.sub,
        actorRole: user.role,
        action: "logout",
        resourceType: "session",
        resourceId: user.sid,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      }),
    ]);
  }

  const res = NextResponse.json({ ok: true });
  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" };
  res.cookies.set("fg_access",  "", { ...base, maxAge: 0 });
  res.cookies.set("fg_refresh", "", { ...base, maxAge: 0 });
  return applySecurityHeaders(res);
}
