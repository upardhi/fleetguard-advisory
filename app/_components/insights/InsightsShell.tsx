"use client";

/**
 * Dark, glass-themed shell used by the Manager + CSO Insights pages.
 *
 * The portal layout itself is light (slate-50 background, light cards).
 * Insights pages need a different aesthetic to deliver the "executive brief"
 * feel — deep-blue gradient backdrop, faint grid, glass cards, glow accents.
 *
 * Wrap the entire page body in <InsightsShell> and use the helper components
 * (GlassCard, KpiTile, Chip, RiskBadge) inside it.
 */

import type { ReactNode } from "react";
import { cx } from "../../_lib/utils";

export const INSIGHTS_PALETTE = {
  brand:    "#3d94ff",
  brandLt:  "#93c5fd",
  emerald:  "#10b981",
  emeraldLt:"#6ee7b7",
  amber:    "#f59e0b",
  amberLt:  "#fcd34d",
  red:      "#ef4444",
  redLt:    "#fca5a5",
  violet:   "#8b5cf6",
  pink:     "#ec4899",
  slate:    "#64748b",
  slateLt:  "#cbd5e1",
} as const;

/** Outer dark gradient pane — replaces the slate-50 portal background. */
export function InsightsShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "relative isolate min-h-screen overflow-x-hidden text-slate-100",
        className,
      )}
      style={{
        background:
          "radial-gradient(1200px 600px at 80% -10%, rgba(61,148,255,.18), transparent 60%)," +
          "radial-gradient(900px 500px at -10% 20%, rgba(16,185,129,.10), transparent 60%)," +
          "radial-gradient(900px 500px at 50% 110%, rgba(139,92,246,.12), transparent 60%)," +
          "#05070d",
      }}
    >
      {/* faint grid mask */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />
      <div className="relative mx-auto max-w-[1400px] px-6 py-8">{children}</div>
    </div>
  );
}

/** Sticky section-tab bar at the top of the insights page. */
export function SectionTabs({
  sections,
  active,
  onChange,
}: {
  sections: { id: string; label: string; tone?: "default" | "emerald" | "amber" | "red" }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-6 mb-6 border-b border-white/5 bg-[#05070d]/75 px-6 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-1 overflow-x-auto">
        {sections.map((s) => {
          const isActive = s.id === active;
          const toneText =
            s.tone === "emerald" ? "text-emerald-300" :
            s.tone === "amber"   ? "text-amber-300"   :
            s.tone === "red"     ? "text-red-300"     :
            "text-slate-300";
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={cx(
                "whitespace-nowrap rounded-lg border border-white/5 px-3 py-1.5 text-xs font-medium transition hover:text-white",
                toneText,
                isActive
                  ? "bg-gradient-to-b from-[rgba(61,148,255,.18)] to-[rgba(61,148,255,.06)] text-white shadow-[0_0_24px_-10px_rgba(61,148,255,.6)]"
                  : "",
              )}
              style={isActive ? { borderColor: "rgba(61,148,255,.45)" } : undefined}
              data-active={isActive ? "true" : "false"}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Glass card with optional glow accent. */
export function GlassCard({
  children,
  className,
  strong = false,
  glow,
}: {
  children: ReactNode;
  className?: string;
  /** Stronger background opacity — used for hero + emphasis cards. */
  strong?: boolean;
  /** Glow ring colour — when set, draws a coloured shadow halo. */
  glow?: "brand" | "emerald" | "amber" | "red" | "violet";
}) {
  const glowStyle: Record<string, string> = {
    brand:   "0 0 40px -10px rgba(61,148,255,.55)",
    emerald: "0 0 40px -10px rgba(16,185,129,.55)",
    amber:   "0 0 40px -10px rgba(245,158,11,.55)",
    red:     "0 0 40px -10px rgba(239,68,68,.55)",
    violet:  "0 0 40px -10px rgba(139,92,246,.55)",
  };
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl border backdrop-blur-xl",
        strong ? "border-white/10" : "border-white/8",
        className,
      )}
      style={{
        background: strong
          ? "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02))"
          : "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.015))",
        borderColor: "rgba(255,255,255,.08)",
        boxShadow: glow ? glowStyle[glow] : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** Pill chip with tone variants. */
export function Chip({
  children,
  tone = "default",
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: "default" | "brand" | "emerald" | "amber" | "red" | "violet";
  /** Show a leading glowing dot (for "live" status pills). */
  dot?: boolean;
  className?: string;
}) {
  const toneStyles: Record<string, { color: string; border: string; bg: string }> = {
    default: { color: "#cbd5e1", border: "rgba(255,255,255,.10)", bg: "rgba(255,255,255,.03)" },
    brand:   { color: "#93c5fd", border: "rgba(61,148,255,.45)",  bg: "rgba(61,148,255,.08)"   },
    emerald: { color: "#6ee7b7", border: "rgba(16,185,129,.40)",  bg: "rgba(16,185,129,.08)"   },
    amber:   { color: "#fcd34d", border: "rgba(245,158,11,.40)",  bg: "rgba(245,158,11,.08)"   },
    red:     { color: "#fca5a5", border: "rgba(239,68,68,.40)",   bg: "rgba(239,68,68,.08)"    },
    violet:  { color: "#c4b5fd", border: "rgba(139,92,246,.40)",  bg: "rgba(139,92,246,.08)"   },
  };
  const t = toneStyles[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.04em]",
        className,
      )}
      style={{ color: t.color, borderColor: t.border, background: t.bg }}
    >
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "currentColor", boxShadow: "0 0 8px currentColor" }}
        />
      )}
      {children}
    </span>
  );
}

/** Risk-tier badge — CRITICAL / HIGH / MEDIUM / LOW. */
export function RiskBadge({ tier }: { tier: "critical" | "high" | "medium" | "low" }) {
  const map = {
    critical: { tone: "red"     as const, label: "CRITICAL" },
    high:     { tone: "amber"   as const, label: "HIGH"     },
    medium:   { tone: "amber"   as const, label: "MEDIUM"   },
    low:      { tone: "emerald" as const, label: "LOW"      },
  };
  return <Chip tone={map[tier].tone}>{map[tier].label}</Chip>;
}

/** Section header — chip + title + subtitle. */
export function SectionHeader({
  chip,
  title,
  subtitle,
  right,
}: {
  chip?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {chip && <div className="mb-3">{chip}</div>}
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
        {subtitle && (
          <p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-[15px]">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
