import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { getUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// Map the DB enum value to the legacy frontend role name used by RoleGuard / portal layouts
function normalizeRole(role: string): string {
  return role === "superadmin" ? "super_admin" : role;
}

// GET /api/v2/me — returns full profile for the authenticated user
export async function GET(req: NextRequest): Promise<NextResponse> {
  const claims = await getUser(req);
  if (!claims) {
    return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const [user] = await db`
    SELECT id, org_id, email, full_name, role, mobile,
           warehouse_id, is_active, mfa_required,
           created_at, updated_at
    FROM   users
    WHERE  id = ${claims.sub}
    LIMIT  1
  `;

  if (!user) {
    return applySecurityHeaders(NextResponse.json({ error: "User not found" }, { status: 404 }));
  }

  return applySecurityHeaders(
    NextResponse.json({
      uid:                  user.id,
      email:                user.email,
      displayName:          user.full_name,
      role:                 normalizeRole(user.role as string),
      warehouseId:          user.warehouse_id ?? "",
      warehouseIds:         [],
      orgId:                user.org_id,
      isActive:             user.is_active,
      mfaRequired:          user.mfa_required,
      forcePasswordReset:   false,
      createdAt:            user.created_at,
      updatedAt:            user.updated_at,
    }),
  );
}
