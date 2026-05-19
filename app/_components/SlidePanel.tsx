"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cx } from "../_lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
};

export function SlidePanel({ open, onClose, title, subtitle, children, width = "md" }: Props) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cx(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cx(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl transition-transform duration-300",
          widths[width],
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>
  );
}

// ── Reusable form field wrapper ───────────────────────────────────────────────

export function Field({
  label,
  required,
  children,
  error,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-danger-600">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger-600">{error}</p>}
    </div>
  );
}

export const inputCls = (error?: string) =>
  cx(
    "h-10 w-full rounded-lg border bg-slate-50 px-3 text-[13px] transition-colors",
    "focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10",
    error ? "border-danger-400 focus:border-danger-500" : "border-slate-200 focus:border-brand-500"
  );

export const textareaCls = (error?: string) =>
  cx(
    "w-full rounded-lg border bg-slate-50 px-3 py-2 text-[13px] transition-colors resize-none",
    "focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10",
    error ? "border-danger-400 focus:border-danger-500" : "border-slate-200 focus:border-brand-500"
  );
