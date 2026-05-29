"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import type { RiskLevel } from "@/app/_lib/types";
import {
    Building2, MapPin, Plus, Search, RefreshCw,
    Loader2, AlertTriangle, ShieldCheck, ChevronRight,
    Map as MapIcon, List, Filter, X, Zap,
} from "lucide-react";
import { getWarehouses, WarehouseV2 } from "@/app/_services/v2";

// ── Region palette (matches region detail page) ───────────────────────────────
const REGION_PAL: Record<string, { bg: string; text: string; badge: string; dot: string }> = {
    north: { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
    east: { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
    west: { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
    south: { bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};
const REGION_LABEL: Record<string, string> = {
    north: "North", east: "East", west: "West", south: "South",
};

// ── Leaflet map ────────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#eab308",
    low: "#22c55e", safe: "#86efac",
};

function WarehouseLeafletMap({
    warehouses,
    selected,
    onSelect,
}: {
    warehouses: WarehouseV2[];
    selected: string | null;
    onSelect: (id: string) => void;
}) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
    const markersRef = useRef<import("leaflet").Layer[]>([]);
    const hasFittedRef = useRef(false);
    const isInitialized = useRef(false); // Add this flag

    // Build markers
    const renderMarkers = useCallback((L: typeof import("leaflet")) => {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        const mapped = warehouses.filter((w) => w.lat && w.lng);
        if (!mapInstanceRef.current || mapped.length === 0) return;

        mapped.forEach((w) => {
            const isSelected = w.id === selected;
            const riskColor = w.openAlerts > 0 ? (w.openAlerts >= 3 ? RISK_COLOR.critical : RISK_COLOR.high) : RISK_COLOR.safe;
            const radius = isSelected ? 14 : 10;

            // Outer glow for selected or critical
            if (isSelected || w.openAlerts >= 2) {
                const glow = L.circleMarker([w.lat!, w.lng!], {
                    radius: radius + 7,
                    fillColor: riskColor,
                    color: "transparent",
                    fillOpacity: 0.18,
                }).addTo(mapInstanceRef.current!);
                markersRef.current.push(glow);
            }

            const marker = L.circleMarker([w.lat!, w.lng!], {
                radius,
                fillColor: riskColor,
                color: isSelected ? "#1e293b" : "white",
                weight: isSelected ? 3 : 2,
                fillOpacity: 0.92,
            })
                .bindTooltip(
                    `<div style="font-family:sans-serif;min-width:160px">
            <div style="font-weight:800;font-size:13px">${w.name}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${w.city}, ${w.state}</div>
            ${w.openAlerts > 0 ? `<div style="margin-top:4px;font-size:11px;color:${riskColor};font-weight:700">⚠ ${w.openAlerts} open alert${w.openAlerts > 1 ? "s" : ""}</div>` : '<div style="margin-top:4px;font-size:11px;color:#22c55e;font-weight:700">✓ Clear</div>'}
          </div>`,
                    { sticky: true },
                )
                .addTo(mapInstanceRef.current!);

            marker.on("click", () => onSelect(w.id));
            markersRef.current.push(marker);
        });

        // Fit bounds on first load
        if (!hasFittedRef.current && mapped.length > 0) {
            const bounds = L.latLngBounds(mapped.map((w) => [w.lat!, w.lng!] as [number, number]));
            mapInstanceRef.current!.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 });
            hasFittedRef.current = true;
        }
    }, [warehouses, selected, onSelect]);

    // Init map - with cleanup and initialization check
    useEffect(() => {
        // Don't initialize if already initialized or no ref
        if (!mapRef.current || isInitialized.current) return;

        // Mark as initialized immediately to prevent double initialization
        isInitialized.current = true;

        import("leaflet").then((L) => {
            // Check again in case component unmounted during import
            if (!mapRef.current) return;

            // Check if map already exists on this container
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

            const map = L.map(mapRef.current, {
                center: [22.5, 82.0],
                zoom: 5,
                zoomControl: true,
                scrollWheelZoom: true,
            });

            mapInstanceRef.current = map;

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 18,
            }).addTo(map);

            renderMarkers(L);
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
            isInitialized.current = false;
            hasFittedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array - only run once

    // Re-render markers when data or selection changes
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        import("leaflet").then((L) => renderMarkers(L));
    }, [renderMarkers]);

    // Pan to selected
    useEffect(() => {
        if (!selected || !mapInstanceRef.current) return;
        const w = warehouses.find((x) => x.id === selected);
        if (w?.lat && w?.lng) {
            mapInstanceRef.current.setView([w.lat, w.lng], Math.max(mapInstanceRef.current.getZoom(), 8), { animate: true });
        }
    }, [selected, warehouses]);

    return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

// ── Warehouse row card ────────────────────────────────────────────────────────
function WarehouseRow({
    warehouse,
    selected,
    onClick,
}: {
    warehouse: WarehouseV2;
    selected: boolean;
    onClick: () => void;
}) {
    const pal = REGION_PAL[warehouse.region?.toLowerCase()] ?? REGION_PAL.north;
    const hasAlerts = warehouse.openAlerts > 0;
    const isCritical = warehouse.openAlerts >= 3;
    const riskLevel: RiskLevel = isCritical ? "critical" : hasAlerts ? "high" : "safe";

    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left flex items-stretch gap-0 rounded-xl border transition-all overflow-hidden group ${selected
                    ? "border-brand-300 shadow-md ring-2 ring-brand-200"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                } bg-white`}
        >
            {/* Risk stripe */}
            <div className={`w-1 shrink-0 ${isCritical ? "bg-red-500" : hasAlerts ? "bg-orange-400" : "bg-emerald-400"}`} />

            <div className="flex-1 px-4 py-3.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold text-slate-800 truncate">{warehouse.name}</span>
                            {warehouse.region && (
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${pal.badge}`}>
                                    {REGION_LABEL[warehouse.region.toLowerCase()] ?? warehouse.region}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <MapPin size={10} className="text-slate-400 shrink-0" />
                            <span className="text-[11px] text-slate-500 truncate">{warehouse.city}, {warehouse.state}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {hasAlerts && <RiskBadge level={riskLevel} size="xs" pulse={isCritical} />}
                        <ChevronRight size={13} className={`text-slate-300 group-hover:text-slate-500 transition-transform ${selected ? "rotate-90 text-brand-400" : ""}`} />
                    </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                    {hasAlerts ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={9} /> {warehouse.openAlerts} alert{warehouse.openAlerts !== 1 ? "s" : ""}
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                            <ShieldCheck size={10} /> Clear
                        </span>
                    )}
                    {warehouse.events24h > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Zap size={9} /> {warehouse.events24h} event{warehouse.events24h !== 1 ? "s" : ""} today
                        </span>
                    )}
                    {warehouse.lat && warehouse.lng && (
                        <span className="text-[10px] text-slate-300 ml-auto flex items-center gap-0.5">
                            <MapPin size={9} /> Pinned
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type ViewMode = "split" | "list" | "map";
type RegionFilter = "all" | "north" | "east" | "west" | "south";

export default function WarehousesPage() {
    const [warehouses, setWarehouses] = useState<WarehouseV2[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
    const [viewMode, setViewMode] = useState<ViewMode>("split");

    async function load(isRefresh = false) {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const data = await getWarehouses();
            setWarehouses(data);
        } catch {
            // silent — could add toast here
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => { load(); }, []);

    // ── Derived stats ─────────────────────────────────────────────────────────
    const stats = useMemo(() => ({
        total: warehouses.length,
        alerts: warehouses.filter((w) => w.openAlerts > 0).length,
        critical: warehouses.filter((w) => w.openAlerts >= 3).length,
        clear: warehouses.filter((w) => w.openAlerts === 0).length,
        mapped: warehouses.filter((w) => w.lat && w.lng).length,
    }), [warehouses]);

    // ── Filtered + sorted list ────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = warehouses;

        if (regionFilter !== "all") {
            list = list.filter((w) => w.region?.toLowerCase() === regionFilter);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((w) =>
                w.name.toLowerCase().includes(q) ||
                w.city.toLowerCase().includes(q) ||
                w.state.toLowerCase().includes(q),
            );
        }

        // Sort: critical first, then alerts, then alphabetical
        return [...list].sort((a, b) => {
            if (a.openAlerts !== b.openAlerts) return b.openAlerts - a.openAlerts;
            return a.name.localeCompare(b.name);
        });
    }, [warehouses, regionFilter, search]);

    const selectedWarehouse = useMemo(
        () => warehouses.find((w) => w.id === selected) ?? null,
        [warehouses, selected],
    );

    const showMap = viewMode === "split" || viewMode === "map";
    const showList = viewMode === "split" || viewMode === "list";

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <TopBar
                title="Warehouses"
                subtitle={loading ? "Loading…" : `${stats.total} depot${stats.total !== 1 ? "s" : ""} · ${stats.alerts} with alerts · ${stats.mapped} mapped`}
                breadcrumbs={[{ label: "Warehouses" }]}
            />

            <div className="flex-1 overflow-auto">
                <div className="p-6 max-w-screen-2xl mx-auto space-y-5">

                    {/* ── Top bar: stats + actions ───────────────────────────────────── */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">

                        {/* KPI strip */}
                        <div className="flex items-center gap-5 flex-wrap">
                            {[
                                { label: "Total", value: stats.total, cls: "text-slate-800" },
                                { label: "Alerts", value: stats.alerts, cls: stats.alerts > 0 ? "text-orange-600" : "text-slate-300" },
                                { label: "Critical", value: stats.critical, cls: stats.critical > 0 ? "text-red-600 font-extrabold" : "text-slate-300" },
                                { label: "Clear", value: stats.clear, cls: "text-emerald-600" },
                            ].map(({ label, value, cls }) => (
                                <div key={label} className="text-center">
                                    <div className={`text-2xl font-bold num ${cls}`}>{loading ? "—" : value}</div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
                                </div>
                            ))}
                            <LiveIndicator />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {/* View toggle */}
                            <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-0.5">
                                {(["split", "list", "map"] as ViewMode[]).map((v) => {
                                    const Icon = v === "list" ? List : v === "map" ? MapIcon : Building2;
                                    return (
                                        <button
                                            key={v}
                                            onClick={() => setViewMode(v)}
                                            title={v.charAt(0).toUpperCase() + v.slice(1)}
                                            className={`p-2 rounded-lg transition-all ${viewMode === v ? "bg-white shadow-sm text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
                                        >
                                            <Icon size={14} />
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => load(true)}
                                disabled={refreshing}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition disabled:opacity-50"
                            >
                                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                                Refresh
                            </button>

                            <Link
                                href="/advisory/warehouses/add"
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-700 text-white rounded-xl hover:bg-brand-800 transition shadow-sm"
                            >
                                <Plus size={14} /> Add Warehouse
                            </Link>
                        </div>
                    </div>

                    {/* ── Filters row ───────────────────────────────────────────────── */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Search */}
                        <div className="relative flex-1 max-w-sm">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search warehouses, city, state…"
                                className="w-full pl-8 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 placeholder:text-slate-400"
                            />
                            {search && (
                                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Region filter */}
                        <div className="flex items-center gap-1">
                            <Filter size={11} className="text-slate-400" />
                            {(["all", "north", "east", "west", "south"] as RegionFilter[]).map((r) => {
                                const pal = r !== "all" ? REGION_PAL[r] : null;
                                const count = r === "all"
                                    ? warehouses.length
                                    : warehouses.filter((w) => w.region?.toLowerCase() === r).length;
                                return (
                                    <button
                                        key={r}
                                        onClick={() => setRegionFilter(r)}
                                        className={`text-[11px] px-2.5 py-1.5 rounded-full border font-semibold transition-all ${regionFilter === r
                                                ? r === "all"
                                                    ? "bg-slate-900 text-white border-slate-900"
                                                    : `${pal!.bg} ${pal!.text} border-current`
                                                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        {r === "all" ? `All (${count})` : `${REGION_LABEL[r]} (${count})`}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Main content area ─────────────────────────────────────────── */}
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 size={28} className="animate-spin text-slate-300" />
                        </div>
                    ) : warehouses.length === 0 ? (
                        /* Empty state */
                        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
                            <Building2 size={40} className="text-slate-200 mb-4" />
                            <p className="text-sm font-semibold text-slate-700 mb-1">No warehouses yet</p>
                            <p className="text-xs text-slate-400 mb-5">Add your first depot to start monitoring routes and disruptions.</p>
                            <Link
                                href="/advisory/warehouses/add"
                                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-brand-700 text-white rounded-xl hover:bg-brand-800 transition"
                            >
                                <Plus size={14} /> Add First Warehouse
                            </Link>
                        </div>
                    ) : (
                        <div className={`grid gap-5 ${showMap && showList ? "xl:grid-cols-5" : "grid-cols-1"}`}>

                            {/* ── List panel ────────────────────────────────────────────── */}
                            {showList && (
                                <div className={`space-y-3 ${showMap ? "xl:col-span-2" : ""}`}>

                                    {/* List header */}
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                            {filtered.length} depot{filtered.length !== 1 ? "s" : ""}
                                            {(search || regionFilter !== "all") ? " (filtered)" : ""}
                                        </p>
                                        {selected && (
                                            <button onClick={() => setSelected(null)} className="text-[10px] text-brand-600 font-semibold hover:text-brand-800">
                                                Clear selection
                                            </button>
                                        )}
                                    </div>

                                    {/* Alert summary strip */}
                                    {stats.critical > 0 && (
                                        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                            <p className="text-[12px] font-semibold text-red-800">
                                                {stats.critical} depot{stats.critical > 1 ? "s" : ""} with critical alerts — hold dispatch
                                            </p>
                                        </div>
                                    )}

                                    {/* Warehouse rows */}
                                    {filtered.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-slate-200">
                                            <Search size={28} className="text-slate-200 mb-2" />
                                            <p className="text-sm font-semibold text-slate-600">No warehouses match</p>
                                            <p className="text-xs text-slate-400 mt-1">Try a different search or filter.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {filtered.map((w) => (
                                                <WarehouseRow
                                                    key={w.id}
                                                    warehouse={w}
                                                    selected={selected === w.id}
                                                    onClick={() => setSelected(selected === w.id ? null : w.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Map panel ─────────────────────────────────────────────── */}
                            {showMap && (
                                <div className={`${showList ? "xl:col-span-3" : ""} space-y-0`}>
                                    <div
                                        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                                        style={{ minHeight: showList ? 520 : 600 }}
                                    >
                                        {/* Map header */}
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <MapIcon size={14} className="text-brand-600" />
                                                <span className="text-sm font-semibold text-slate-800">Depot Locations</span>
                                                <span className="text-[10px] text-slate-400">{stats.mapped} of {stats.total} pinned</span>
                                            </div>
                                            {selected && selectedWarehouse && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-semibold text-brand-700">{selectedWarehouse.name}</span>
                                                    <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Map */}
                                        <div style={{ height: showList ? 480 : 560 }}>
                                            <WarehouseLeafletMap
                                                warehouses={warehouses}
                                                selected={selected}
                                                onSelect={(id) => setSelected(selected === id ? null : id)}
                                            />
                                        </div>
                                    </div>

                                    {/* Selected warehouse detail card (map-only or split mode) */}
                                    {selected && selectedWarehouse && (
                                        <div className="mt-4 bg-white rounded-2xl border border-brand-200 shadow-sm overflow-hidden">
                                            <div className="flex items-start gap-4 px-5 py-4">
                                                {/* Region dot */}
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${REGION_PAL[selectedWarehouse.region?.toLowerCase()]?.bg ?? "bg-slate-100"
                                                    }`}>
                                                    <Building2 size={16} className={REGION_PAL[selectedWarehouse.region?.toLowerCase()]?.text ?? "text-slate-500"} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900">{selectedWarehouse.name}</p>
                                                            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                                                <MapPin size={9} /> {selectedWarehouse.city}, {selectedWarehouse.state}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {selectedWarehouse.region && (
                                                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${REGION_PAL[selectedWarehouse.region.toLowerCase()]?.badge ?? ""}`}>
                                                                    {REGION_LABEL[selectedWarehouse.region.toLowerCase()] ?? selectedWarehouse.region}
                                                                </span>
                                                            )}
                                                            {selectedWarehouse.openAlerts > 0 ? (
                                                                <RiskBadge level={selectedWarehouse.openAlerts >= 3 ? "critical" : "high"} size="xs" />
                                                            ) : (
                                                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                                                                    <ShieldCheck size={10} /> Clear
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                                        {[
                                                            { label: "Open Alerts", value: selectedWarehouse.openAlerts, cls: selectedWarehouse.openAlerts > 0 ? "text-orange-600" : "text-emerald-600" },
                                                            { label: "Events 24h", value: selectedWarehouse.events24h, cls: "text-slate-700" },
                                                            {
                                                                label: "Coordinates",
                                                                value: selectedWarehouse.lat && selectedWarehouse.lng
                                                                    ? `${Number(selectedWarehouse.lat).toFixed(3)}, ${Number(selectedWarehouse.lng).toFixed(3)}`
                                                                    : "Not pinned",
                                                                cls: "text-slate-500 text-[10px]"
                                                            },
                                                        ].map(({ label, value, cls }) => (
                                                            <div key={label} className="bg-slate-50 rounded-lg p-2.5 text-center">
                                                                <div className={`text-sm font-bold num ${cls}`}>{value}</div>
                                                                <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">{label}</div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {selectedWarehouse.address && (
                                                        <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed">{selectedWarehouse.address}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}