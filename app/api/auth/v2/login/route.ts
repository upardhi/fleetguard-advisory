import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { createSession } from "@/app/_server/auth/sessions";
import { ACCESS_COOKIE_MAX_AGE, REFRESH_COOKIE_MAX_AGE } from "@/app/_server/auth/jwt";
import bcrypt from "bcrypt";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const [user] = await db`
      SELECT u.id, u.org_id, u.role, u.password_hash, u.is_active
      FROM users u
      WHERE u.email = ${email.toLowerCase().trim()}
      LIMIT 1
    `;

    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    const { accessToken, refreshToken } = await createSession({
      userId: user.id,
      orgId: user.org_id,
      role: user.role,
      ip,
      userAgent,
      mfaVerified: true,
    });

    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set("fg_access", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_MAX_AGE,
      path: "/",
    });
    res.cookies.set("fg_refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
