"use client";

import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { cx } from "../_lib/utils";

export type FilterOption = { value: string; label: string };

export type FilterField =
  | { type: "chips"; key: string; label: string; options: FilterOption[] }
  | { type: "multi"; key: string; label: string; options: FilterOption[] }
  | { type: "select"; key: string; label: string; options: FilterOption[]; placeholder?: string };

export type FilterValues = Record<string, string | string[]>;

type Props = {
  fields: FilterField[];
  values: FilterValues;
  onChange: (key: string, value: string | string[]) => void;
  onClear: () => void;
};

function countActive(fields: FilterField[], values: FilterValues): number {
  let n = 0;
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === "multi" && Array.isArray(v) && v.length > 0) n++;
    else if (f.type === "chips" && v && v !== "all") n++;
    else if (f.type === "select" && v && v !== "") n++;
  }
  return n;
}

export function FilterDrawer({ fields, values, onChange, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const count = countActive(fields, values);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "relative inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-all",
          count > 0
            ? "border-brand-500 bg-brand-50 text-brand-700"
            : "border-slate-300 bg-white text-slate-800 shadow-xs hover:bg-slate-50"
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        Filter
        {count > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white leading-none">
            {count}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        className={cx(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        className={cx(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <h2 className="text-[15px] font-semibold text-slate-900">Filters</h2>
            {count > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700 leading-none">
                {count}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {fields.map((field) => (
            <FilterSection
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(val) => onChange(field.key, val)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClear}
            disabled={count === 0}
            className="text-[13px] font-medium text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-brand-800 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

function FilterSection({
  field,
  value,
  onChange,
}: {
  field: FilterField;
  value: string | string[] | undefined;
  onChange: (val: string | string[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {field.label}
      </p>

      {field.type === "chips" && (
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((opt) => (
            <ChipBtn
              key={opt.value}
              active={value === opt.value || (!value && opt.value === "all")}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </ChipBtn>
          ))}
        </div>
      )}

      {field.type === "multi" && (
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((opt) => {
            const sel = Array.isArray(value) && value.includes(opt.value);
            return (
              <ChipBtn
                key={opt.value}
                active={sel}
                onClick={() => {
                  const cur = Array.isArray(value) ? value : [];
                  onChange(sel ? cur.filter((v) => v !== opt.value) : [...cur, opt.value]);
                }}
              >
                {opt.label}
              </ChipBtn>
            );
          })}
        </div>
      )}

      {field.type === "select" && (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
        >
          <option value="">{field.placeholder ?? "Any"}</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ChipBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      )}
    >
      {children}
    </button>
  );
}
