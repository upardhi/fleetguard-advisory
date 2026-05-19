import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// Portals that require an authenticated session cookie.
const PORTAL_PREFIXES = ["/superadmin", "/company", "/guard", "/manager", "/cso"];

/**
 * Pull the `exp` claim out of an unverified JWT payload. We don't verify
 * the signature here — that's the API's job. We just need a quick "is this
 * token plausibly fresh?" check so /login can decide whether to bounce
 * an already-authenticated user away.
 */
function jwtExp(token: string): number | null {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    // base64url → standard base64 → JSON. atob requires padding (length
    // multiple of 4); JWT payloads frequently omit it.
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const accessCookie = req.cookies.get("fg_access")?.value;

  // ── /login: skip the form when the user is already authenticated ──────────
  //
  // Why: previously /login had no auth-check, so a user who hit the login
  // URL directly (bookmark, manual nav, or coming back to the tab) was shown
  // the form and re-entered credentials, creating a *new* session row every
  // time. The DB would accumulate live sessions for the same user, and from
  // the user's POV "I'm getting logged out every visit" — when really they
  // were just being shown a form they didn't need.
  //
  // /login/mfa is intentionally NOT redirected: during the MFA step the
  // pre-MFA cookie is set but the session isn't fully authenticated yet.
  if (pathname === "/login" && accessCookie) {
    const exp = jwtExp(accessCookie);
    if (exp && exp * 1000 > Date.now()) {
      // Cookie looks fresh — bounce to /auth/redirect, which calls /me to
      // get the role and routes the user to their portal home. If the cookie
      // turns out to be revoked server-side, /auth/redirect clears it and
      // sends them back here — the cleared cookie means we won't loop.
      return NextResponse.redirect(new URL("/auth/redirect", req.url));
    }
  }

  const isPortal = PORTAL_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPortal && !accessCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Apply to everything except:
     * - Next.js internals (_next/static, _next/image)
     * - Public favicon
     * - Dealer delivery pages (/deliver/*)
     * - Auth API routes (login/logout must be reachable unauthenticated)
     * - Forgot-password page (must be reachable unauthenticated)
     *
     * /login is intentionally INCLUDED so we can redirect already-
     * authenticated users away from the form.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|deliver/|api/auth/v2/login|api/auth/v2/logout|forgot-password).*)",
  ],
};
