"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, AlertCircle, ShieldAlert, Gavel } from "lucide-react";
import { api, ApiError } from "../_services/v2/api";

export interface AICaseSummary {
  index:     number;
  summary:   string;
  status:    string;
  riskLevel: string;
  severity:  string;
  type:      string;
  year:      string;
}

export interface AIOverallSummary {
  totalCases:     number;
  pattern:        string;
  behavior:       string;
  riskLevel:      string;
  recommendation: string;
  narrative:      string;
}

export interface AISummaryResponse {
  cases:       AICaseSummary[];
  overall:     AIOverallSummary;
  generatedAt: string;
  source:      "openai" | "fallback";
}

/** Shared hook used both by the overall-summary card and by the case-card
 *  renderer so they hit the API once and share the same data.
 *
 *  Behaviour: regenerates the AI summary on every component mount —
 *  matches the manager/insights AISummaryCard pattern where each page
 *  visit produces a fresh narrative. The previous result is cleared on
 *  remount so the skeleton always shows briefly. */
export function useIncidentAISummary(incidentId: string | null | undefined) {
  const [data, setData]       = useState<AISummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr]         = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!incidentId) return;
    setLoading(true);
    setErr(null);
    try {
      const j = await api.post<AISummaryResponse>(
        `/api/v2/incidents/${incidentId}/ai-summary`,
        { force: true || force },   // always-force from the client side too
      );
      setData(j);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message
        : e instanceof Error ? e.message
        : "Failed to generate summary";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (!incidentId) return;
    // Fresh fetch on every mount — clear stale prose first so the
    // skeleton renders and the manager sees a real "generating" state.
    setData(null);
    setErr(null);
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  return { data, loading, err, refresh };
}

/** Look up the AI summary for a single case row by its position in the
 *  caseDetails array. Returns null if the AI summary hasn't loaded yet
 *  or no case at that index was generated. Used by IncidentDetail.tsx
 *  to render the AI line inside each case card. */
export function findCaseSummary(
  ai: AISummaryResponse | null,
  caseIndex: number,
): AICaseSummary | null {
  if (!ai) return null;
  return ai.cases[caseIndex] ?? null;
}

/** Overall driver-risk summary card. Per-case prose is rendered inline
 *  inside each crime-check card by the parent — this component shows
 *  only the high-level paragraph + pattern / behaviour / recommendation. */
export function IncidentAIOverall({
  data,
  loading,
  err,
  onRefresh,
}: {
  data:     AISummaryResponse | null;
  loading:  boolean;
  err:      string | null;
  onRefresh: () => void;
}) {
  const riskTone = (r: string): string => {
    const x = r.toLowerCase();
    if (x === "high")   return "bg-danger-50 text-danger-700 ring-danger-200";
    if (x === "medium") return "bg-warning-50 text-warning-700 ring-warning-200";
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-linear-to-br from-blue-50/60 via-white to-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          <Sparkles className="h-3 w-3" />
          Driver Risk Summary
        </span>
        {/* <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-40"
          aria-label="Regenerate AI summary"
        >
          <RefreshCw className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          {loading ? "Generating…" : "Regenerate"}
        </button> */}
      </div>

      {/* Initial load — show full skeleton until first response lands. */}
      {loading && !data && <Skeleton />}

      {err && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Could not generate summary</div>
            <div className="mt-0.5 text-red-600/80">{err}</div>
          </div>
        </div>
      )}

      {/* Regenerating with existing data — keep the previous result visible
          and surface a small shimmer banner at the top so the manager knows
          a refresh is in flight. */}
      {loading && data && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-1.5 text-[11px] text-blue-700">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Generating fresh AI summary…</span>
        </div>
      )}

      {!err && data && data.cases.length === 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-emerald-800">
            <ShieldAlert className="h-4 w-4" />
            No prior cases on driver
          </div>
          <p className="mt-1 text-emerald-700/90">{data.overall.narrative}</p>
        </div>
      )}

      {!err && data && data.cases.length > 0 && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <Gavel className="h-4 w-4 text-blue-700" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                Overall Driver Risk Summary
              </span>
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${riskTone(data.overall.riskLevel)}`}>
                Overall Risk: {data.overall.riskLevel}
              </span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-slate-700">
              {data.overall.narrative}
            </p>
            <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
              {/* <div>
                <span className="font-semibold text-slate-500">Pattern: </span>
                <span className="text-slate-700">{data.overall.pattern}</span>
              </div> */}
              {/* <div>
                <span className="font-semibold text-slate-500">Behaviour: </span>
                <span className="text-slate-700">{data.overall.behavior}</span>
              </div> */}
              {/* <div className="sm:col-span-2">
                <span className="font-semibold text-slate-500">Recommendation: </span>
                <span className="text-slate-700">{data.overall.recommendation}</span>
              </div> */}
            </div>
          </div>
          {/* <div className="mt-3 text-[10.5px] uppercase tracking-wider text-slate-400">
            Generated {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </div> */}
        </>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {/* "Overall Driver Risk Summary" header strip */}
        <div className="mb-3 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-slate-200" />
          <div className="h-3 w-40 rounded bg-slate-200" />
          <div className="ml-auto h-5 w-24 rounded-full bg-slate-200" />
        </div>
        {/* Narrative — 3 lines of varying width */}
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-11/12 rounded bg-slate-100" />
          <div className="h-3 w-8/12 rounded bg-slate-100" />
        </div>
        {/* Pattern / Behaviour / Recommendation row */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="h-3 w-5/6 rounded bg-slate-100" />
          <div className="h-3 w-4/5 rounded bg-slate-100" />
          <div className="h-3 w-full rounded bg-slate-100 sm:col-span-2" />
        </div>
      </div>
    </div>
  );
}

/** Compact inline shimmer — used inside each case card while the AI
 *  summary is being generated. Exported so IncidentDetail.tsx can render
 *  it next to the case row when ai.loading is true. */
export function CaseAISkeleton() {
  return (
    <div className="mt-2 animate-pulse rounded-md bg-blue-50/50 px-2.5 py-2 ring-1 ring-blue-100">
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="h-1 w-1 rounded-full bg-blue-300" />
        <div className="h-2 w-20 rounded bg-blue-200" />
        <div className="ml-auto h-3 w-16 rounded-full bg-blue-200" />
      </div>
      <div className="space-y-1">
        <div className="h-2 w-full rounded bg-blue-100" />
        <div className="h-2 w-10/12 rounded bg-blue-100" />
      </div>
    </div>
  );
}
