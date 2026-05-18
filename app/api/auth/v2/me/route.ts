import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";

export async function GET(req: NextRequest) {
  try {
    const claims = await requireUser(req);

    const [user] = await db`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.org_id,
        u.warehouse_id,
        o.name AS org_name
      FROM users u
      LEFT JOIN organisations o ON o.id = u.org_id
      WHERE u.id = ${claims.sub}
      LIMIT 1
    `;

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      id:          user.id,
      email:       user.email,
      name:        user.full_name,
      role:        user.role,
      orgId:       user.org_id,
      orgName:     user.org_name,
      warehouseId: user.warehouse_id ?? null,
    });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
