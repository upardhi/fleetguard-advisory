"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Truck, Plus, MapPin, ArrowRight, X, Loader2, Route as RouteIcon,
  AlertTriangle, Filter, Navigation,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";

interface Trip {
  id: string;
  origin_name: string;
  destination_name: string;
  truck_reg: string | null;
  driver_name: string | null;
  cargo_type: string | null;
  scheduled_at: string | null;
  status: string;
  route_count: number;
  alert_count: number;
  created_at: string;
}

const STATUS_CFG: Record<string, string> = {
  planned:    "bg-slate-100 text-slate-600 border-slate-200",
  monitoring: "bg-blue-50 text-blue-700 border-blue-200",
  dispatched: "bg-green-50 text-green-700 border-green-200",
  completed:  "bg-slate-100 text-slate-500 border-slate-200",
  cancelled:  "bg-red-50 text-red-600 border-red-200",
};

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  function load() {
    setLoading(true);
    fetch("/api/advisory/v1/trips", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTrips(d.trips ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => trips.filter((t) => statusFilter === "all" || t.status === statusFilter),
    [trips, statusFilter],
  );

  const monitoring = trips.filter((t) => t.status === "monitoring").length;
  const totalAlerts = trips.reduce((s, t) => s + Number(t.alert_count), 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Trips" subtitle={`${trips.length} trips being tracked`} />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <Link href="/advisory" className="text-sm text-slate-500 hover:text-slate-800">
              ← Back to Control Tower
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition"
            >
              <Plus size={14} />New Trip
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatBox icon={Truck}         label="Total Trips" value={trips.length} cls="bg-brand-50 text-brand-700" />
            <StatBox icon={Navigation}    label="Monitoring"  value={monitoring}   cls="bg-blue-50 text-blue-700" />
            <StatBox icon={AlertTriangle} label="Open Alerts" value={totalAlerts}  cls="bg-red-50 text-red-700" />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all">All statuses</option>
              {Object.keys(STATUS_CFG).map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-sm text-slate-400 gap-2">
                <Loader2 size={18} className="animate-spin" />Loading trips…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <Truck size={32} className="mb-2 text-slate-200" />
                <p className="text-sm">No trips yet</p>
                <button onClick={() => setShowCreate(true)} className="mt-2 text-xs text-brand-600 hover:underline">
                  Create your first trip →
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Route</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Truck / Driver</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Routes</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Alerts</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 font-semibold text-slate-900">
                          <MapPin size={13} className="text-brand-500 shrink-0" />
                          {t.origin_name}
                          <ArrowRight size={12} className="text-slate-300" />
                          {t.destination_name}
                        </div>
                        {t.cargo_type && <div className="text-xs text-slate-500 mt-0.5">{t.cargo_type}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-slate-700">{t.truck_reg ?? "—"}</div>
                        <div className="text-xs text-slate-500">{t.driver_name ?? ""}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${STATUS_CFG[t.status] ?? STATUS_CFG.planned}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-slate-600 num">
                          <RouteIcon size={12} className="text-slate-400" />{t.route_count}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {Number(t.alert_count) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold num">
                            <AlertTriangle size={12} />{t.alert_count}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Link href={`/advisory/trips/${t.id}`} className="text-xs text-brand-600 font-semibold hover:underline">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showCreate && <CreateTripModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function StatBox({ icon: Icon, label, value, cls }: { icon: React.ComponentType<{ size?: number }>; label: string; value: number; cls: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}><Icon size={18} /></div>
      <div>
        <div className="text-2xl font-bold text-slate-900 num">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function CreateTripModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    originName: "", destinationName: "", truckReg: "", driverName: "",
    cargoType: "", scheduledAt: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.originName || !form.destinationName) {
      setError("Origin and destination are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/advisory/v1/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          scheduledAt: form.scheduledAt || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to create trip");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">New Trip</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origin *">
              <input value={form.originName} onChange={(e) => set("originName", e.target.value)} placeholder="Kolkata" className={inp} />
            </Field>
            <Field label="Destination *">
              <input value={form.destinationName} onChange={(e) => set("destinationName", e.target.value)} placeholder="Siliguri" className={inp} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Truck Reg">
              <input value={form.truckReg} onChange={(e) => set("truckReg", e.target.value)} placeholder="WB 12 AB 1234" className={inp} />
            </Field>
            <Field label="Driver">
              <input value={form.driverName} onChange={(e) => set("driverName", e.target.value)} placeholder="Driver name" className={inp} />
            </Field>
          </div>
          <Field label="Cargo Type">
            <input value={form.cargoType} onChange={(e) => set("cargoType", e.target.value)} placeholder="FMCG / Consumer Goods" className={inp} />
          </Field>
          <Field label="Scheduled Departure">
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} className={inp} />
          </Field>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 transition"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Create Trip
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300";
