"use client";
import { Bell, RefreshCw, Building2, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import LiveIndicator from "./LiveIndicator";
import { useAdvisory } from "@/app/_contexts/AdvisoryContext";

export default function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const { selectedWarehouse, clearWarehouse } = useAdvisory();

  function switchWarehouse() {
    clearWarehouse();
    router.push("/advisory/select-warehouse");
  }

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <LiveIndicator />

        {/* Warehouse context chip */}
        {selectedWarehouse && (
          <button
            onClick={switchWarehouse}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-200 bg-brand-50 hover:bg-brand-100 transition group"
          >
            <Building2 size={12} className="text-brand-600 shrink-0" />
            <span className="text-[11px] font-semibold text-brand-700 max-w-[140px] truncate">
              {selectedWarehouse.name}
            </span>
            <span className="text-[10px] text-brand-400">{selectedWarehouse.code}</span>
            <ChevronRight size={10} className="text-brand-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {actions}

        <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors relative">
          <Bell size={16} className="text-slate-500" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
        <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <RefreshCw size={16} className="text-slate-500" />
        </button>
      </div>
    </header>
  );
}
