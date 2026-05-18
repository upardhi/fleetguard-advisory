import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const claims = await requireUser(req);

    const users = await db`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.warehouse_id,
        u.created_at,
        w.name  AS warehouse_name,
        w.code  AS warehouse_code,
        w.city  AS warehouse_city
      FROM users u
      LEFT JOIN warehouses w ON w.id = u.warehouse_id
      WHERE u.org_id = ${claims.org}
      ORDER BY u.role, u.full_name
    `;

    return NextResponse.json({ users });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
