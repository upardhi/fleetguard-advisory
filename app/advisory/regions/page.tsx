"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import type { RiskLevel } from "@/app/_lib/types";
import {
  AlertTriangle,
  ShieldCheck,
  Zap,
  Building2,
  Route,
  Users,
  ArrowRight,
  Loader2,
  Clock,
  RefreshCw,
  Map as MapPinIcon,
  Plus,
  X,
  Info,
  ChevronDown,
  Check,
} from "lucide-react";
import type { CityEntry, RegionMapData } from "@/app/_components/IndiaRegionsMap";
import { INDIA_STATES } from "@/app/_components/ServiceProviderDrawer";

interface AddRegionForm {
  id: string;
  label: string;
  color: string;
  states: string; // newline-separated in the textarea
}

// Leaflet requires the browser — disable SSR
const IndiaRegionsMap = dynamic(() => import("@/app/_components/IndiaRegionsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-slate-300">
      <Loader2 size={24} className="animate-spin" />
    </div>
  ),
});

interface RegionIssue {
  title: string;
  state: string | null;
  riskLevel: string;
  category: string | null;
}

interface RegionStat {
  id: string;
  label: string;
  color: string;
  disruptions: number;
  critical: number;
  high: number;
  worstRisk: string;
  topIssues: RegionIssue[];
  corridors: number;
  cities: number;
  cityList: CityEntry[];
  teamMembers: number;
  lastIntelAt: string | null;
}

const REGION_PALETTE: Record<string, { bg: string; border: string; text: string; hdr: string }> = {
  north: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", hdr: "bg-blue-600" },
  east: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    hdr: "bg-orange-500",
  },
  west: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    hdr: "bg-purple-600",
  },
  south: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    hdr: "bg-emerald-600",
  },
};

const CATEGORY_ICON: Record<string, string> = {
  political: "🚫",
  weather: "🌩",
  traffic: "⛽",
  security: "🔒",
  infrastructure: "🛣",
  religious: "🎯",
  vvip: "🚨",
  natural_disaster: "🌊",
};

const COLOR_SWATCHES = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // yellow
  "#16a34a", // green
  "#0891b2", // cyan
  "#0d9488", // teal
  "#9333ea", // purple
  "#64748b", // slate
  "#1e293b", // dark
];

function fmtIst(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Add Region Modal ──────────────────────────────────────────────────────────

interface AddRegionModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddRegionModal({ onClose, onSaved }: AddRegionModalProps) {
  const [form, setForm] = useState<AddRegionForm>({
    id: "",
    label: "",
    color: "#2563eb",
    states: "",
  });
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [success, setSuccess] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Auto-derive id from label
  function handleLabelChange(val: string) {
    setForm((f) => ({
      ...f,
      label: val,
      id: val
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 32),
    }));
    setErrors((e) => ({ ...e, label: "", id: "" }));
  }

  function toggleState(state: string) {
    setSelectedStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
    setErrors((e) => ({ ...e, states: "" }));
  }

  function removeState(state: string) {
    setSelectedStates((prev) => prev.filter((s) => s !== state));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.id) e.id = "ID is required";
    else if (!/^[a-z0-9_-]{1,32}$/.test(form.id))
      e.id = "Use lowercase letters, numbers, hyphens or underscores (max 32)";
    if (!form.label.trim()) e.label = "Label is required";
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(form.color)) e.color = "Enter a valid hex color";
    if (selectedStates.length === 0) e.states = "Select at least one state";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setApiError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/advisory/v1/regions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          label: form.label.trim(),
          color: form.color,
          states: selectedStates,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Handle validation errors from backend
        if (data.details && Array.isArray(data.details)) {
          setApiError(data.details.join("; "));
        } else if (data.error) {
          setApiError(data.error);
        } else {
          setApiError("Failed to create region");
        }
      } else {
        setSuccess(true);
        // Wait a moment to show success message before closing
        setTimeout(() => {
          onSaved();
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error("Network error:", err);
      setApiError("Network error — please check your connection and try again");
    } finally {
      setSubmitting(false);
    }
  }

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  const filteredStates = INDIA_STATES.filter(
    (s) => s.toLowerCase().includes(stateSearch.toLowerCase()) && !selectedStates.includes(s)
  );

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Plus size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Add New Region</h2>
              <p className="text-[11px] text-slate-400">Create an ITC ops region</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Region Label
            </label>
            <input
              type="text"
              placeholder="e.g. Central"
              maxLength={80}
              value={form.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl outline-none transition focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${errors.label ? "border-red-400" : "border-slate-200"}`}
            />
            {errors.label && <p className="text-[11px] text-red-500">{errors.label}</p>}
          </div>

          {/* ID — derived but editable */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              Region ID
              <span title="Used in URLs and the database. Auto-derived from label.">
                <Info size={11} className="text-slate-400 cursor-help" />
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">
                /
              </span>
              <input
                type="text"
                placeholder="central"
                maxLength={32}
                value={form.id}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                  }));
                  setErrors((err) => ({ ...err, id: "" }));
                }}
                className={`w-full pl-7 pr-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl outline-none font-mono transition focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${errors.id ? "border-red-400" : "border-slate-200"}`}
              />
            </div>
            {errors.id && <p className="text-[11px] text-red-500">{errors.id}</p>}
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Region Color
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Swatches */}
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, color: c }));
                    setErrors((e) => ({ ...e, color: "" }));
                  }}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? "#0f172a" : "transparent",
                    boxShadow: form.color === c ? "0 0 0 2px #fff, 0 0 0 4px #0f172a" : undefined,
                  }}
                />
              ))}
              {/* Custom hex */}
              <div className="flex items-center gap-2 ml-1">
                <div
                  className="w-7 h-7 rounded-full border border-slate-200 shrink-0"
                  style={{ backgroundColor: form.color }}
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, color: e.target.value }));
                    setErrors((err) => ({ ...err, color: "" }));
                  }}
                  placeholder="#3b82f6"
                  maxLength={7}
                  className={`w-24 px-2.5 py-1.5 text-xs font-mono bg-slate-50 border rounded-lg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${errors.color ? "border-red-400" : "border-slate-200"}`}
                />
              </div>
            </div>
            {errors.color && <p className="text-[11px] text-red-500">{errors.color}</p>}
          </div>

          {/* States */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Covered States / UTs
              <span className="ml-1.5 text-slate-400 font-normal normal-case">
                ({selectedStates.length} selected)
              </span>
            </label>

            {/* Selected chips */}
            {selectedStates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[44px]">
                {selectedStates.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg text-white"
                    style={{ backgroundColor: form.color || "#2563eb" }}
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeState(s)}
                      className="opacity-70 hover:opacity-100 transition"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* State picker toggle */}
            <button
              type="button"
              onClick={() => setShowStatePicker((v) => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition text-slate-600"
            >
              <span>{showStatePicker ? "Close state picker" : "Pick states / UTs …"}</span>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition-transform ${showStatePicker ? "rotate-180" : ""}`}
              />
            </button>

            {showStatePicker && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-2 border-b border-slate-100 bg-slate-50">
                  <input
                    type="text"
                    placeholder="Search states…"
                    value={stateSearch}
                    onChange={(e) => setStateSearch(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-brand-400"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto p-2 grid grid-cols-2 gap-1">
                  {filteredStates.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleState(s)}
                      className="text-left text-[11px] px-2.5 py-1.5 rounded-lg hover:bg-brand-50 hover:text-brand-700 text-slate-600 transition flex items-center gap-1.5"
                    >
                      <span className="w-3.5 h-3.5 rounded-sm border border-slate-300 flex items-center justify-center shrink-0" />
                      {s}
                    </button>
                  ))}
                  {filteredStates.length === 0 && (
                    <p className="col-span-2 text-center text-[11px] text-slate-400 py-3">
                      No states match
                    </p>
                  )}
                </div>
                {selectedStates.length > 0 && (
                  <div className="border-t border-slate-100 p-2">
                    <p className="text-[10px] text-slate-400 text-center">
                      Already selected: {selectedStates.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* API error banner */}
            {apiError && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            {/* Success banner - MOVED HERE */}
            {success && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                <Check size={14} className="shrink-0 mt-0.5" />
                <span>Region "{form.label}" created successfully! Redirecting...</span>
              </div>
            )}
          </div>

          {/* Preview */}
          {form.label && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3.5 pt-3 pb-1">
                Preview
              </div>
              <div className="flex items-center gap-3 px-4 pb-4">
                <div
                  className="w-2.5 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: form.color }}
                />
                <div>
                  <p className="text-sm font-bold text-slate-800">{form.label || "Region Label"}</p>
                  <p className="text-[10px] text-slate-400">
                    {selectedStates.length} state{selectedStates.length !== 1 ? "s" : ""} covered
                  </p>
                </div>
                <div
                  className="ml-auto px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white"
                  style={{ backgroundColor: form.color }}
                >
                  {form.id || "id"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || success}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Creating…
              </>
            ) : success ? (
              <>
                <Check size={13} /> Created!
              </>
            ) : (
              <>
                <Check size={13} /> Create Region
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/advisory/v1/regions", { credentials: "include" });
      if (res.ok) {
        const d = (await res.json()) as { regions: RegionStat[] };
        setRegions(d.regions);
      }
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalDisruptions = regions.reduce((a, r) => a + r.disruptions, 0);
  const totalCritical = regions.reduce((a, r) => a + r.critical, 0);
  const totalHigh = regions.reduce((a, r) => a + r.high, 0);
  const affectedRegions = regions.filter((r) => r.disruptions > 0).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Regions" subtitle="ITC Ops Regions — North · East · West · South" />

      {showAddModal && (
        <AddRegionModal onClose={() => setShowAddModal(false)} onSaved={() => load(true)} />
      )}

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
          {/* Summary strip */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
              <AlertTriangle size={15} className="text-orange-500" />
              <span className="text-sm font-bold text-slate-800 num">{totalDisruptions}</span>
              <span className="text-xs text-slate-500">Total Disruptions</span>
            </div>
            {totalCritical > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 shadow-sm">
                <Zap size={15} className="text-red-500" />
                <span className="text-sm font-bold text-red-700 num">{totalCritical}</span>
                <span className="text-xs text-red-600">Critical</span>
              </div>
            )}
            {totalHigh > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 shadow-sm">
                <AlertTriangle size={15} className="text-orange-500" />
                <span className="text-sm font-bold text-orange-700 num">{totalHigh}</span>
                <span className="text-xs text-orange-600">High Risk</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
              <ShieldCheck size={15} className="text-emerald-500" />
              <span className="text-sm font-bold text-slate-800 num">{4 - affectedRegions}</span>
              <span className="text-xs text-slate-500">Regions Clear</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <LiveIndicator />
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition shadow-sm"
              >
                <Plus size={13} />
                Add Region
              </button>
            </div>
          </div>

          {/* India Map */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPinIcon size={15} className="text-brand-600" />
                <h2 className="text-sm font-semibold text-slate-800">Region & City Map</h2>
                <span className="text-xs text-slate-400">
                  — Click any region bubble for details
                </span>
              </div>
              {!loading && (
                <span className="text-[11px] text-slate-400">
                  {regions.reduce((a, r) => a + r.cities, 0)} depot cities mapped
                </span>
              )}
            </div>
            <div style={{ height: 460 }}>
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-300">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : (
                <IndiaRegionsMap
                  regions={regions.map(
                    (r): RegionMapData => ({
                      id: r.id,
                      label: r.label,
                      worstRisk: r.worstRisk,
                      disruptions: r.disruptions,
                      critical: r.critical,
                      high: r.high,
                      corridors: r.corridors,
                      cities: r.cities,
                      cityList: r.cityList ?? [],
                    })
                  )}
                />
              )}
            </div>
          </div>

          {/* Region top-table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">ITC Operations Regions</h2>
              <span className="text-xs text-slate-400">Click any region to drill down →</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-slate-300" />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {/* Table header */}
                <div className="grid grid-cols-12 px-5 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <div className="col-span-2">Region</div>
                  <div className="col-span-1 text-center">Risk</div>
                  <div className="col-span-1 text-center overflow-hidden">Critical</div>
                  <div className="col-span-1 text-center overflow-hidden">High</div>
                  <div className="col-span-1 text-center">Total</div>
                  <div className="col-span-2">Top Issue</div>
                  <div className="col-span-1 text-center overflow-hidden">Routes</div>
                  <div className="col-span-1 text-center overflow-hidden">Cities</div>
                  <div className="col-span-1 text-center overflow-hidden">Team</div>
                  <div className="col-span-1 text-right overflow-hidden">Last Scan</div>
                </div>

                {regions.map((r) => {
                  const pal = REGION_PALETTE[r.id] ?? REGION_PALETTE.north;
                  const topIssue = r.topIssues[0];
                  return (
                    <Link
                      key={r.id}
                      href={`/advisory/regions/${r.id}`}
                      className="grid grid-cols-12 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Region name */}
                      <div className="col-span-2 flex items-center gap-3">
                        <div className={`w-2.5 h-10 rounded-full ${pal.hdr}`} />
                        <div>
                          <p className={`text-sm font-bold ${pal.text}`}>{r.label}</p>
                          <p className="text-[10px] text-slate-400">{r.cities} depot cities</p>
                        </div>
                      </div>

                      {/* Risk badge */}
                      <div className="col-span-1 flex justify-center">
                        <RiskBadge
                          level={r.worstRisk as RiskLevel}
                          size="xs"
                          pulse={r.worstRisk === "critical"}
                        />
                      </div>

                      {/* Critical count */}
                      <div className="col-span-1 text-center">
                        {r.critical > 0 ? (
                          <span className="inline-block text-sm font-bold text-red-600 num">
                            {r.critical}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>

                      {/* High count */}
                      <div className="col-span-1 text-center">
                        {r.high > 0 ? (
                          <span className="inline-block text-sm font-bold text-orange-500 num">
                            {r.high}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>

                      {/* Total */}
                      <div className="col-span-1 text-center">
                        <span
                          className={`text-sm font-semibold num ${r.disruptions > 0 ? "text-slate-800" : "text-slate-300"}`}
                        >
                          {r.disruptions > 0 ? r.disruptions : "✓"}
                        </span>
                      </div>

                      {/* Top issue */}
                      <div className="col-span-2 min-w-0 pr-2">
                        {topIssue ? (
                          <div>
                            <p className="text-[11px] text-slate-700 font-medium leading-snug line-clamp-2">
                              {CATEGORY_ICON[topIssue.category ?? ""] ?? "⚠"} {topIssue.title}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{topIssue.state}</p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                            <ShieldCheck size={11} /> All clear
                          </span>
                        )}
                      </div>

                      {/* Corridors */}
                      <div className="col-span-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Route size={11} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700 num">
                            {r.corridors}
                          </span>
                        </div>
                      </div>

                      {/* Cities */}
                      <div className="col-span-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Building2 size={11} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700 num">
                            {r.cities}
                          </span>
                        </div>
                      </div>

                      {/* Team */}
                      <div className="col-span-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users size={11} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700 num">
                            {r.teamMembers}
                          </span>
                        </div>
                      </div>

                      {/* Last scan */}
                      <div className="col-span-1 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Clock size={10} className="text-slate-300 shrink-0" />
                          <span className="text-[10px] text-slate-400 leading-tight text-right">
                            {fmtIst(r.lastIntelAt)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Region cards grid — quick visual summary */}
          {!loading && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {regions.map((r) => {
                const pal = REGION_PALETTE[r.id] ?? REGION_PALETTE.north;
                return (
                  <Link
                    key={r.id}
                    href={`/advisory/regions/${r.id}`}
                    className={`rounded-2xl border ${pal.border} bg-white shadow-sm hover:shadow-md transition-all overflow-hidden group`}
                  >
                    {/* Colour header */}
                    <div className={`${pal.hdr} px-4 py-3 flex items-center justify-between`}>
                      <span className="text-white font-bold text-sm tracking-wide">
                        {r.label} Region
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all"
                      />
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Counts */}
                      <div className="flex items-center gap-3">
                        {r.critical > 0 && (
                          <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <span className="text-xs font-bold text-red-700 num">
                              {r.critical} Critical
                            </span>
                          </div>
                        )}
                        {r.high > 0 && (
                          <div className="flex items-center gap-1.5 bg-orange-50 rounded-lg px-2.5 py-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            <span className="text-xs font-bold text-orange-700 num">
                              {r.high} High
                            </span>
                          </div>
                        )}
                        {r.disruptions === 0 && (
                          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                            <ShieldCheck size={12} /> All clear
                          </span>
                        )}
                      </div>

                      {/* Top issues */}
                      <div className="space-y-1.5">
                        {r.topIssues.slice(0, 2).map((issue, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${issue.riskLevel === "critical" ? "bg-red-500" : "bg-orange-400"}`}
                            />
                            <p className="text-[11px] text-slate-600 leading-snug line-clamp-1">
                              {issue.title}
                            </p>
                          </div>
                        ))}
                        {r.disruptions === 0 && (
                          <p className="text-[11px] text-slate-400 italic">No active disruptions</p>
                        )}
                      </div>

                      {/* Footer */}
                      <div
                        className={`flex items-center justify-between pt-2 border-t ${pal.border}`}
                      >
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                          <span>
                            <Route size={10} className="inline mr-0.5" />
                            {r.corridors} corridors
                          </span>
                          <span>
                            <Building2 size={10} className="inline mr-0.5" />
                            {r.cities} cities
                          </span>
                        </div>
                        <span className={`text-[10px] font-semibold ${pal.text}`}>View →</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
