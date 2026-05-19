"use client";

import type { ReactNode } from "react";
import { GlassCard } from "./InsightsShell";
import { cx } from "../../_lib/utils";

/**
 * Hero KPI tile — large monospace number with glow corner accent.
 * Used in the Overview section grid (4 across on desktop).
 */
export function KpiTile({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  glow = false,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "emerald" | "amber" | "red" | "violet";
  /** Add a coloured shadow halo (use sparingly — usually for alert tiles). */
  glow?: boolean;
  /** Optional extra content after the number (e.g. breakdown rows). */
  children?: ReactNode;
}) {
  const accentBg: Record<string, string> = {
    brand:   "rgba(61,148,255,.10)",
    emerald: "rgba(16,185,129,.10)",
    amber:   "rgba(245,158,11,.10)",
    red:     "rgba(239,68,68,.10)",
    violet:  "rgba(139,92,246,.10)",
  };
  const valueColor: Record<string, string> = {
    brand:   "text-white",
    emerald: "text-white",
    amber:   "text-white",
    red:     "text-red-300",
    violet:  "text-white",
  };
  const iconColor: Record<string, string> = {
    brand:   "text-brand-400",
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
    violet:  "text-violet-400",
  };

  return (
    <GlassCard className="p-5" glow={glow ? tone : undefined}>
      <div
        aria-hidden
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl"
        style={{ background: accentBg[tone] }}
      />
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[.15em] text-slate-400">
          {label}
        </span>
        {icon && <span className={cx("h-4 w-4", iconColor[tone])}>{icon}</span>}
      </div>
      <div className={cx("num relative mt-3 text-4xl font-bold leading-none", valueColor[tone])}>
        {value}
      </div>
      {sub && <div className="relative mt-2 text-xs text-slate-400">{sub}</div>}
      {children && <div className="relative mt-3">{children}</div>}
    </GlassCard>
  );
}

/** Compact stat tile — secondary row under the hero KPIs. */
export function MiniStat({
  label,
  value,
  total,
  tone = "default",
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Optional " / total" suffix — useful for "valid licenses 506 / 536". */
  total?: ReactNode;
  tone?: "default" | "brand" | "emerald" | "amber" | "red";
  sub?: ReactNode;
}) {
  const valueColor: Record<string, string> = {
    default: "text-white",
    brand:   "text-brand-300",
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
  };
  return (
    <GlassCard className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cx("num mt-1 text-2xl font-semibold", valueColor[tone])}>
        {value}
        {total !== undefined && (
          <span className="ml-1 text-sm text-slate-500"> / <span className="num">{total}</span></span>
        )}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </GlassCard>
  );
}
