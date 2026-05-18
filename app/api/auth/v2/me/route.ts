import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";

export async function GET(req: NextRequest) {
  const claims = await getUser(req);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db`
    SELECT u.id, u.email, u.full_name, u.role, u.org_id,
           o.name AS org_name
    FROM users u
    LEFT JOIN organisations o ON o.id = u.org_id
    WHERE u.id = ${claims.sub}
    LIMIT 1
  `;

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.full_name,
    role: user.role,
    orgId: user.org_id,
    orgName: user.org_name,
  });
}
