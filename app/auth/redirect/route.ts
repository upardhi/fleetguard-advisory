import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/app/_server/auth/getUser";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("fg_access", "", { maxAge: 0, path: "/" });
    return res;
  }
  return NextResponse.redirect(new URL("/advisory", req.url));
}
