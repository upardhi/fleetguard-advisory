"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdvisory, type AdvisoryWarehouse } from "@/app/_contexts/AdvisoryContext";
import Logo from "@/app/_components/Logo";
import {
  MapPin,
  Building2,
  ArrowRight,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";

export default function SelectWarehousePage() {
  const router  = useRouter();
  const { user, warehouses, loading, selectWarehouse } = useAdvisory();

  // If only one warehouse, auto-select and go
  useEffect(() => {
    if (!loading && warehouses.length === 1) {
      selectWarehouse(warehouses[0]);
      router.replace("/advisory");
    }
  }, [loading, warehouses, selectWarehouse, router]);

  function pick(w: AdvisoryWarehouse) {
    selectWarehouse(w);
    router.push("/advisory");
  }

  async function handleLogout() {
    await fetch("/api/auth/v2/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen radial-glow flex flex-col items-center justify-center p-6">

      {/* Card */}
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Logo />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-brand-200 hover:text-white text-sm transition"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Panel header */}
          <div className="px-7 py-6 border-b border-slate-100">
            <h1 className="text-lg font-bold text-slate-900">Select Operating Warehouse</h1>
            <p className="text-sm text-slate-500 mt-1">
              {user ? (
                <>
                  Signed in as <span className="font-medium text-slate-700">{user.email}</span>
                  {user.orgName && (
                    <> &mdash; <span className="font-medium text-brand-600">{user.orgName}</span></>
                  )}
                </>
              ) : "Choose the warehouse you are planning routes from."}
            </p>
          </div>

          {/* Body */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
                <Loader2 size={22} className="animate-spin text-brand-500" />
                <span className="text-sm">Loading warehouses…</span>
              </div>
            ) : warehouses.length === 0 ? (
              <div className="text-center py-16">
                <Building2 size={40} className="mx-auto mb-3 text-slate-300" />
                <h3 className="text-sm font-semibold text-slate-600 mb-1">
                  No warehouses configured
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mb-4">
                  Your organisation has no active warehouses set up yet.
                  Ask your company admin to add warehouses in FleetGuard.
                </p>
                <button
                  onClick={handleLogout}
                  className="text-xs text-brand-600 font-semibold hover:underline"
                >
                  Sign out and switch account
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-4">
                  {warehouses.length} warehouse{warehouses.length !== 1 ? "s" : ""} available in your organisation
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {warehouses.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => pick(w)}
                      className="group text-left p-4 rounded-xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50 transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-brand-100 group-hover:bg-brand-200 flex items-center justify-center shrink-0 transition-colors">
                            <Building2 size={16} className="text-brand-700" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate leading-tight">
                              {w.name}
                            </p>
                            <p className="text-xs font-mono text-slate-400 mt-0.5">{w.code}</p>
                          </div>
                        </div>
                        <ArrowRight
                          size={16}
                          className="text-slate-300 group-hover:text-brand-500 shrink-0 mt-0.5 transition-colors"
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">
                          {[w.city, w.state].filter(Boolean).join(", ")}
                          {w.region ? ` · ${w.region}` : ""}
                        </span>
                      </div>

                      {w.address && (
                        <p className="mt-1 text-[11px] text-slate-400 truncate pl-4">
                          {w.address}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {!loading && warehouses.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Advisory intelligence will be scoped to your selected warehouse&apos;s region.
              </p>
              <button
                className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:text-brand-800 transition"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={11} />
                Refresh
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-brand-300 text-xs mt-6">
          Warehouses are managed by your superadmin in FleetGuard.
        </p>
      </div>
    </div>
  );
}
