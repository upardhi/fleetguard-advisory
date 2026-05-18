"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AdvisoryProvider, useAdvisory } from "@/app/_contexts/AdvisoryContext";
import Sidebar from "@/app/_components/Sidebar";
import { Loader2 } from "lucide-react";

function AdvisoryGate({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { loading, user, selectedWarehouse, warehouses } = useAdvisory();

  useEffect(() => {
    if (loading) return;

    // Not authenticated — send to login
    if (!user) {
      router.replace("/login");
      return;
    }

    // Superadmin has no warehouse but can still access everything
    if (user.role === "super_admin" || user.role === "superadmin") return;

    // Need warehouse selection if not already selected and not on select page
    if (!selectedWarehouse && pathname !== "/advisory/select-warehouse") {
      if (warehouses.length > 0) {
        router.replace("/advisory/select-warehouse");
      }
    }
  }, [loading, user, selectedWarehouse, warehouses, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-brand-500" />
          <p className="text-sm text-slate-500">Loading advisory platform…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {pathname !== "/advisory/select-warehouse" && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function AdvisoryLayout({ children }: { children: ReactNode }) {
  return (
    <AdvisoryProvider>
      <AdvisoryGate>{children}</AdvisoryGate>
    </AdvisoryProvider>
  );
}
