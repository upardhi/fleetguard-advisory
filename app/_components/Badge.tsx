import type { ReactNode } from "react";
import { cx, categoryIcon, categoryLabel } from "../_lib/utils";
import type { DisruptionCategory } from "../_lib/types";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "muted";

type Size = "sm" | "md";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-success-300",
  warning: "bg-warning-50 text-warning-700 ring-accent-300",
  danger: "bg-danger-50 text-danger-700 ring-danger-300",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  muted: "bg-slate-50 text-slate-500 ring-slate-200",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  dot = false,
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        tones[tone],
        className
      )}
    >
      {dot && (
        <span
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            tone === "success" && "bg-success-500",
            tone === "warning" && "bg-accent-500",
            tone === "danger" && "bg-danger-500",
            tone === "brand" && "bg-brand-500",
            tone === "neutral" && "bg-slate-400",
            tone === "info" && "bg-sky-500",
            tone === "muted" && "bg-slate-300"
          )}
        />
      )}
      {icon}
      {children}
    </span>
  );
}

const CATEGORY_TONE: Record<DisruptionCategory, string> = {
  political:        "bg-red-50   text-red-700   border border-red-200",
  natural_disaster: "bg-blue-50  text-blue-700  border border-blue-200",
  weather:          "bg-sky-50   text-sky-700   border border-sky-200",
  security:         "bg-purple-50 text-purple-700 border border-purple-200",
  vvip:             "bg-amber-50 text-amber-700 border border-amber-200",
  traffic:          "bg-orange-50 text-orange-700 border border-orange-200",
  infrastructure:   "bg-slate-100 text-slate-700 border border-slate-200",
  religious:        "bg-indigo-50 text-indigo-700 border border-indigo-200",
};

export default function CategoryBadge({ category }: { category: DisruptionCategory }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_TONE[category]}`}>
      <span>{categoryIcon(category)}</span>
      {categoryLabel(category)}
    </span>
  );
}
