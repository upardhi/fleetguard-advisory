import type { ReactNode } from "react";
import { cx } from "../_lib/utils";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, subtitle, actions, tabs, className }: Props) {
  return (
    <header className={cx("border-b border-slate-200 bg-white px-8 pt-6 pb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-2xl text-[13.5px] text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-4 -mb-4">{tabs}</div>}
    </header>
  );
}
