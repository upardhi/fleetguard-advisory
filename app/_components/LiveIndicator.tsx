import { cx } from "../_lib/utils";

export function LiveIndicator({
  label = "LIVE",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-success-700 ring-1 ring-inset ring-success-300",
        className
      )}
    >
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-success-500" />
      {label}
    </span>
  );
}
