import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cx } from "../_lib/utils";

type Props = {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  tone?: "default" | "brand" | "success" | "warning" | "danger" | "info" | "muted";
  className?: string;
};

const toneRing: Record<NonNullable<Props["tone"]>, string> = {
  default: "",
  brand: "ring-1 ring-brand-100",
  success: "ring-1 ring-success-100",
  warning: "ring-1 ring-accent-100",
  danger: "ring-1 ring-danger-100",
  info: "ring-1 ring-sky-100",
  muted: "",
};

const toneIcon: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-accent-50 text-accent-700",
  danger: "bg-danger-50 text-danger-700",
  info: "bg-sky-50 text-sky-700",
  muted: "bg-slate-100 text-slate-500",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  tone = "default",
  className,
}: Props) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-xs",
        toneRing[tone],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
            {label}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="num text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
            {trend && (
              <span
                className={cx(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  trend.positive ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700"
                )}
              >
                {trend.positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.value}
              </span>
            )}
          </div>
          {hint && <div className="mt-1 text-[12px] text-slate-500">{hint}</div>}
        </div>
        {Icon && (
          <div
            className={cx("flex h-10 w-10 items-center justify-center rounded-lg", toneIcon[tone])}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </div>
        )}
      </div>
    </div>
  );
}
