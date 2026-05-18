"use client";
import { Bell, RefreshCw } from "lucide-react";
import LiveIndicator from "./LiveIndicator";

export default function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <LiveIndicator />
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
