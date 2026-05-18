import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PROTECTED = ["/advisory"];

function jwtExp(token: string): number | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("fg_access")?.value;

  if (pathname === "/login" && token) {
    const exp = jwtExp(token);
    if (exp && exp * 1000 > Date.now()) {
      return NextResponse.redirect(new URL("/auth/redirect", req.url));
    }
  }

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (isProtected && !token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/auth/v2/login|api/auth/v2/logout).*)"],
};
