"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus, ArrowLeft, Route, AlertTriangle, CheckCircle2,
  Loader2, Trash2, RefreshCw, Clock,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";

interface WatchedRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  is_active: boolean;
  routes_fetched: boolean;
  last_intel_at: string | null;
  max_risk_level: string;
  disruption_count: number;
  created_at: string;
}

const RISK_STYLE: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high:     "bg-orange-50 text-orange-700 border-orange-200",
  medium:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  low:      "bg-blue-50 text-blue-700 border-blue-200",
  safe:     "bg-green-50 text-green-700 border-green-200",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function WatchedCorridorsPage() {
  const [routes, setRoutes]       = useState<WatchedRoute[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/advisory/v1/watched-routes", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { routes: WatchedRoute[] };
        setRoutes(data.routes);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/advisory/v1/watched-routes/${id}`, { method: "DELETE", credentials: "include" });
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    setDeleting(null);
  }

  const disrupted = routes.filter((r) => r.disruption_count > 0).length;
  const critical  = routes.filter((r) => r.max_risk_level === "critical" || r.max_risk_level === "high").length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Watched Corridors" subtitle={`${routes.length} routes under active surveillance`} />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <Link href="/advisory" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft size={14} />Back to Control Tower
            </Link>
            <button onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition">
              <Plus size={14} />Watch a Corridor
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatBox label="Corridors Watched" value={routes.length} cls="bg-brand-50 text-brand-700"   icon={Route} />
            <StatBox label="With Disruptions"  value={disrupted}     cls="bg-orange-50 text-orange-700" icon={AlertTriangle} />
            <StatBox label="Critical / High"   value={critical}      cls="bg-red-50 text-red-700"       icon={AlertTriangle} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <Loader2 size={22} className="animate-spin mr-2" />Loading corridors...
            </div>
          ) : routes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center h-52 text-slate-400 space-y-3">
              <Route size={32} className="text-slate-200" />
              <p className="text-sm">No corridors being watched yet</p>
              <button onClick={() => setShowModal(true)} className="text-xs text-brand-600 font-medium hover:underline">
                + Add your first corridor
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden">
                  <div className="flex items-start gap-4 p-5">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                      <Route size={18} className="text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{r.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${RISK_STYLE[r.max_risk_level] ?? RISK_STYLE.safe}`}>
                          {r.max_risk_level}
                        </span>
                        {r.disruption_count > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            {r.disruption_count} disruption{r.disruption_count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-600">
                        <span className="font-medium">{r.origin}</span>
                        <span className="text-slate-300">to</span>
                        <span className="font-medium">{r.destination}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        {r.routes_fetched ? (
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={11} />Segments mapped</span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600"><Loader2 size={11} className="animate-spin" />Mapping segments...</span>
                        )}
                        <span className="flex items-center gap-1"><Clock size={11} />Last scan: {timeAgo(r.last_intel_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/advisory/planned/${r.id}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition">
                        View corridor
                      </Link>
                      <button onClick={() => void handleDelete(r.id)} disabled={deleting === r.id}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        {deleting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                  {r.disruption_count > 0 && (
                    <div className="px-5 pb-3">
                      <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                        <AlertTriangle size={12} className="text-red-500 shrink-0" />
                        <span className="text-xs text-red-700">
                          {r.disruption_count} active disruption{r.disruption_count > 1 ? "s" : ""} detected on this corridor
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => void load()} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
              <RefreshCw size={12} />Refresh
            </button>
          </div>
        </div>
      </div>
      {showModal && <AddCorridorModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); void load(); }} />}
    </div>
  );
}

function AddCorridorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [origin, setOrigin]           = useState("");
  const [destination, setDestination] = useState("");
  const [name, setName]               = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/advisory/v1/watched-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ origin, destination, name }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to create");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Watch a Corridor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">x</button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            Enter any route your trucks use. We will map every district, tehsil, and highway on the corridor and watch for disruptions automatically.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Origin *</label>
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Mumbai" required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Destination *</label>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Nagpur" required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Label (optional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Mumbai-Nagpur run"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
              {saving ? <><Loader2 size={14} className="animate-spin" />Saving...</> : "Start Watching"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatBox({ label, value, cls, icon: Icon }: {
  label: string; value: number; cls: string; icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900 num">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
