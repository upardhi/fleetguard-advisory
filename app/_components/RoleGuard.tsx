"use client";

/**
 * FleetGuard — RoleGuard
 * Wraps a route segment. Redirects away if the signed-in user's role
 * is not in the allowed list.
 *
 * Usage:
 *   <RoleGuard allowed={["wh_manager", "super_admin"]}>
 *     {children}
 *   </RoleGuard>
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthV2 } from "../_hooks/useAuthV2";
import type { UserRole } from "../_lib/types";

const ROLE_HOME: Record<string, string> = {
  guard:            "/guard",
  wh_manager:       "/manager",
  regional_manager: "/manager",
  cso:              "/cso",
  company_admin:    "/company",
  super_admin:      "/superadmin",
  superadmin:       "/superadmin",
};

interface Props {
  allowed: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowed, children }: Props) {
  const { fgUser, loading } = useAuthV2();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Not signed in — send to login
    if (!fgUser) {
      router.replace("/login");
      return;
    }

    // Wrong role — send to the correct home for their role
    if (!allowed.includes(fgUser.role)) {
      router.replace(ROLE_HOME[fgUser.role] ?? "/login");
    }
  }, [fgUser, loading, allowed, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-[13px] text-slate-400">Loading…</div>
      </div>
    );
  }

  if (!fgUser || !allowed.includes(fgUser.role)) return null;

  return <>{children}</>;
}
