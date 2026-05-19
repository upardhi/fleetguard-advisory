"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  MapPin, ArrowRight, Loader2, Route as RouteIcon, AlertTriangle,
  Navigation, Building2, Milestone, Play, RefreshCw, Clock, Gauge,
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
  notes: string | null;
}
interface RouteRow {
  id: string;
  label: string;
  summary: string | null;
  distance_km: string | null;
  duration_hours: string | null;
  is_primary: boolean;
  risk_level: string;
}
interface Segment {
  id: string;
  route_id: string;
  segment_type: string;
  name: string;
  state: string | null;
  seq: number;
}
interface Alert {
  id: string;
  matched_segment: string | null;
  severity: string;
  message: string;
  status: string;
  category: string;
  risk_level: string;
  eta_impact_hours: string;
  confidence: number;
  created_at: string;
}

const SEG_LABEL: Record<string, string> = {
  district: "Districts",
  tehsil: "Tehsils",
  national_highway: "National Highways",
  state_highway: "State Highways",
};
const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  info:     "bg-blue-50 text-blue-700 border-blue-200",
};

export default function TripDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [trip, setTrip]         = useState<Trip | null>(null);
  const [routes, setRoutes]     = useState<RouteRow[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [alerts, setAlerts]     = useState<Alert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [fetchingRoutes, setFetchingRoutes] = useState(false);
  const [running, setRunning]   = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/advisory/v1/trips/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setTrip(d.trip ?? null);
        setRoutes(d.routes ?? []);
        setSegments(d.segments ?? []);
        setAlerts(d.alerts ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  async function fetchRoutes() {
    setFetchingRoutes(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/advisory/v1/trips/${id}/routes`, {
        method: "POST", credentials: "include",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setMsg(`Found ${d.routes.length} route(s) and mapped their segments.`);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to fetch routes");
    } finally {
      setFetchingRoutes(false);
    }
  }

  async function runPipeline() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/advisory/v1/pipeline`, {
        method: "POST", credentials: "include",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Pipeline failed");
      const r = d.result;
      setMsg(`Pipeline done — ${r.newsFound} news, ${r.disruptions} disruptions, ${r.alerts} alerts.`);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Trip" />
        <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
          <Loader2 size={18} className="animate-spin" />Loading…
        </div>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Trip" />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <p className="text-sm">Trip not found</p>
          <Link href="/advisory/trips" className="mt-2 text-xs text-brand-600 hover:underline">← All trips</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title={`${trip.origin_name} → ${trip.destination_name}`} subtitle="Trip monitoring" />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          <Link href="/advisory/trips" className="text-sm text-slate-500 hover:text-slate-800">
            ← All trips
          </Link>

          {/* Trip header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <MapPin size={18} className="text-brand-500" />
              {trip.origin_name}
              <ArrowRight size={16} className="text-slate-300" />
              {trip.destination_name}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Meta label="Truck"     value={trip.truck_reg ?? "—"} />
              <Meta label="Driver"    value={trip.driver_name ?? "—"} />
              <Meta label="Cargo"     value={trip.cargo_type ?? "—"} />
              <Meta label="Status"    value={trip.status} />
            </div>
            {trip.notes && <p className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-3">{trip.notes}</p>}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchRoutes}
              disabled={fetchingRoutes}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 transition"
            >
              {fetchingRoutes ? <Loader2 size={14} className="animate-spin" /> : <RouteIcon size={14} />}
              {routes.length > 0 ? "Re-fetch Routes" : "Fetch Routes"}
            </button>
            <button
              onClick={runPipeline}
              disabled={running || routes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run News Scan
            </button>
            <button onClick={load} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw size={13} />Refresh
            </button>
          </div>
          {msg && (
            <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">{msg}</p>
          )}

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-sm font-semibold text-slate-900">Route Alerts ({alerts.length})</span>
              </div>
              <div className="divide-y divide-slate-100">
                {alerts.map((a) => (
                  <div key={a.id} className="px-5 py-3.5">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${SEVERITY_CLS[a.severity] ?? SEVERITY_CLS.info}`}>
                        {a.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">{a.message}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                          <span className="capitalize">{a.category}</span>
                          {a.matched_segment && <span>· {a.matched_segment}</span>}
                          <span className="inline-flex items-center gap-0.5"><Clock size={10} />+{a.eta_impact_hours}h</span>
                          <span className="inline-flex items-center gap-0.5"><Gauge size={10} />{a.confidence}% conf.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Routes + segments */}
          {routes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <RouteIcon size={32} className="mx-auto mb-2 text-slate-200" />
              <p className="text-sm text-slate-400">No routes mapped yet</p>
              <p className="text-xs text-slate-400 mt-1">Click &quot;Fetch Routes&quot; to discover routes and the areas they cross.</p>
            </div>
          ) : (
            routes.map((route) => {
              const routeSegs = segments.filter((s) => s.route_id === route.id);
              const grouped: Record<string, Segment[]> = {};
              for (const s of routeSegs) (grouped[s.segment_type] ??= []).push(s);
              return (
                <div key={route.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Navigation size={14} className="text-brand-600" />
                      <span className="text-sm font-semibold text-slate-900">{route.label}</span>
                      {route.is_primary && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">PRIMARY</span>
                      )}
                      {route.summary && <span className="text-xs text-slate-400">via {route.summary}</span>}
                    </div>
                    <div className="text-xs text-slate-500 num">
                      {route.distance_km ?? "—"} km · {route.duration_hours ?? "—"} h
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    {["national_highway", "state_highway", "district", "tehsil"].map((type) => {
                      const items = grouped[type];
                      if (!items || items.length === 0) return null;
                      const Icon = type.endsWith("highway") ? Milestone : Building2;
                      return (
                        <div key={type}>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Icon size={11} />{SEG_LABEL[type]} ({items.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((s) => (
                              <span key={s.id} className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">
                                {s.name}{s.state ? <span className="text-slate-400"> · {s.state}</span> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-400 uppercase">{label}</div>
      <div className="text-slate-800 capitalize">{value}</div>
    </div>
  );
}
