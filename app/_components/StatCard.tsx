import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  accent?: "red" | "orange" | "green" | "blue" | "amber";
}) {
  const accentRing = {
    red:    "border-red-200 bg-white",
    orange: "border-orange-200 bg-white",
    green:  "border-emerald-200 bg-white",
    blue:   "border-brand-200 bg-white",
    amber:  "border-amber-200 bg-white",
  }[accent ?? "blue"];

  const iconBg = {
    red:    "bg-red-50 text-red-500",
    orange: "bg-orange-50 text-orange-500",
    green:  "bg-emerald-50 text-emerald-600",
    blue:   "bg-brand-50 text-brand-600",
    amber:  "bg-amber-50 text-amber-600",
  }[accent ?? "blue"];

  const valueColor = {
    red:    "text-red-600",
    orange: "text-orange-600",
    green:  "text-emerald-600",
    blue:   "text-brand-700",
    amber:  "text-amber-600",
  }[accent ?? "blue"];

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 shadow-sm ${accentRing}`}>
      <div className={`rounded-lg p-2 shrink-0 ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className={`text-2xl font-bold num leading-tight ${valueColor}`}>{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
