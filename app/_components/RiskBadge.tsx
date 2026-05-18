import type { RiskLevel } from "@/app/_lib/types";

const STYLES: Record<RiskLevel, string> = {
  critical: "bg-red-100 text-red-700 border border-red-300 ring-1 ring-red-200",
  high:     "bg-orange-100 text-orange-700 border border-orange-300",
  medium:   "bg-amber-100 text-amber-700 border border-amber-300",
  low:      "bg-green-100 text-green-700 border border-green-300",
  safe:     "bg-emerald-100 text-emerald-700 border border-emerald-300",
};

const DOT: Record<RiskLevel, string> = {
  critical: "bg-red-500 live-dot-red",
  high:     "bg-orange-500",
  medium:   "bg-amber-500",
  low:      "bg-green-500",
  safe:     "bg-emerald-500",
};

export default function RiskBadge({
  level,
  size = "sm",
  pulse = false,
}: {
  level: RiskLevel;
  size?: "xs" | "sm" | "md";
  pulse?: boolean;
}) {
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  const textSize = size === "xs" ? "text-[9px]" : size === "md" ? "text-xs" : "text-[10px]";
  const px = size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide ${textSize} ${px} ${STYLES[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[level]} ${pulse && level === "critical" ? "live-dot-red" : ""}`} />
      {label}
    </span>
  );
}
