import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { enrollTotp } from "@/app/_server/auth/mfa";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// POST /api/auth/v2/mfa/enroll
// Returns TOTP secret + otpauth URI. The credential is stored unverified;
// the client must confirm with POST /api/auth/v2/mfa/verify before it is
// activated and the session upgraded to mfa=true.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const { credentialId, secret, uri } = await enrollTotp(user.sub, user.org);

  return applySecurityHeaders(
    NextResponse.json({ credentialId, secret, uri }),
  );
}
