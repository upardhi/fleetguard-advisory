"use client";

import { cx } from "../_lib/utils";

// ── Action categorisation ─────────────────────────────────────────────────────

export type AuditActionTone = "brand" | "success" | "warning" | "danger" | "info" | "muted";

export interface AuditActionMeta { tone: AuditActionTone; label: string }

export function categoriseAuditAction(action: string): AuditActionMeta {
  const a = action.toLowerCase();
  if (a.includes("override"))           return { tone: "danger",  label: action };
  if (a.includes("revoke") || a.includes("block") || a.includes("suspend"))
                                        return { tone: "danger",  label: action };
  if (a.includes("resolve"))            return { tone: "success", label: action };
  if (a.includes("acknowledge") || a.includes("ack"))
                                        return { tone: "warning", label: action };
  if (a.includes("gate") || a.includes("entry") || a.includes("exit"))
                                        return { tone: "brand",   label: action };
  if (a.includes("driver") || a.includes("dl") || a.includes("bg"))
                                        return { tone: "info",    label: action };
  if (a.includes("vehicle") || a.includes("trip"))
                                        return { tone: "info",    label: action };
  if (a.includes("alert") || a.includes("incident"))
                                        return { tone: "warning", label: action };
  if (a.includes("create") || a.includes("register") || a.includes("add"))
                                        return { tone: "success", label: action };
  if (a.includes("update") || a.includes("edit") || a.includes("change"))
                                        return { tone: "muted",   label: action };
  if (a.includes("delete") || a.includes("remove") || a.includes("deactivat"))
                                        return { tone: "danger",  label: action };
  return { tone: "muted", label: action };
}

// ── Entity chip ──────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  driver:           "bg-sky-50 text-sky-700 ring-sky-100",
  vehicle:          "bg-indigo-50 text-indigo-700 ring-indigo-100",
  trip:             "bg-brand-50 text-brand-700 ring-brand-100",
  gate_event:       "bg-accent-50 text-accent-700 ring-accent-100",
  alert:            "bg-orange-50 text-orange-700 ring-orange-100",
  incident:         "bg-danger-50 text-danger-700 ring-danger-100",
  service_provider: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  visitor:          "bg-purple-50 text-purple-700 ring-purple-100",
};

export function EntityChip({ entityType }: { entityType: string }) {
  const cls = ENTITY_COLORS[entityType.toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", cls)}>
      {entityType.replace(/_/g, " ")}
    </span>
  );
}

// ── Detail renderers ─────────────────────────────────────────────────────────

function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function AuditSummaryPreview({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail);
  const primary = entries[0];
  const extra = entries.length - 1;
  if (!primary) return <span className="text-[11.5px] text-slate-400">—</span>;
  const [k, v] = primary;
  return (
    <div className="text-[12px] text-slate-700">
      <span className="text-slate-400">{k.replace(/_/g, " ")}: </span>
      <span className="text-slate-800">{truncate(formatDetailValue(v), 80)}</span>
      {/* {extra > 0 && (
        <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
          +{extra}
        </span>
      )} */}
    </div>
  );
}

export function AuditDetailGrid({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        Details
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              {k.replace(/_/g, " ")}
            </dt>
            <dd className="mt-0.5 wrap-break-word text-[12px] text-slate-800">
              {formatDetailValue(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
