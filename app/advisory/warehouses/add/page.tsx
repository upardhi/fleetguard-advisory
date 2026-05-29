"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { TopBar } from "@/app/_components/TopBar";
import {
    MapPin, Crosshair, Building2, ChevronDown,
    Loader2, CheckCircle2, AlertCircle, ArrowLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Region {
    id: string;
    label: string;
    states: string[];
}

// ─── Leaflet picker — SSR-disabled ───────────────────────────────────────────

const WarehouseLocationPicker = dynamic(
    () => import("./_components/WarehouseLocationPicker"),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full text-slate-300">
                <Loader2 size={24} className="animate-spin" />
            </div>
        ),
    },
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddWarehousePage() {
    const router = useRouter();

    // Form fields
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [address, setAddress] = useState("");
    const [region, setRegion] = useState("");
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);

    // UI
    const [regions, setRegions] = useState<Region[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

    // Load regions for the dropdown
    useEffect(() => {
        fetch("/api/advisory/v1/regions", { credentials: "include" })
            .then((r) => r.json())
            .then((d) =>
                setRegions(
                    (d.regions ?? []).map((r: { id: string; label: string; states?: string[] }) => ({
                        id: r.id, label: r.label, states: r.states ?? [],
                    })),
                ),
            )
            .catch(() => { });
    }, []);

    // Called by the map picker when user drops a pin
    function handleLocationPicked(picked: {
        lat: number;
        lng: number;
        city?: string;
        state?: string;
        address?: string;
    }) {
        setLat(picked.lat);
        setLng(picked.lng);
        if (picked.city && !city) setCity(picked.city);
        if (picked.state && !state) setState(picked.state);
        if (picked.address && !address) setAddress(picked.address);

        // Auto-select region from state
        if (picked.state && !region) {
            const matched = regions.find((r) =>
                r.states.some((s) => s.toLowerCase() === picked.state!.toLowerCase()),
            );
            if (matched) setRegion(matched.id);
        }
    }

    // Submit
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name || !city || !state) return;

        setSaving(true);
        try {
            const res = await fetch("/api/v2/warehouses", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    code: code || undefined,
                    city,
                    state,
                    region: region || undefined,
                    address: address || undefined,
                    lat,
                    lng,
                }),
            });

            if (!res.ok) throw new Error(await res.text());

            setToast({ type: "ok", msg: "Warehouse created! Discovering nearby cities…" });
            setTimeout(() => router.push("/advisory/warehouses"), 1800);
        } catch {
            setToast({ type: "err", msg: "Failed to save warehouse. Please try again." });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <TopBar
                title="Add Warehouse"
                subtitle="Create a new depot and pin its location on the map"
                breadcrumbs={[
                    { label: "Warehouses", href: "/advisory/warehouses" },
                    { label: "Add Warehouse" }
                ]}
            />

            <div className="flex-1 overflow-auto">
                <form onSubmit={handleSubmit} className="p-6 max-w-screen-xl mx-auto">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                        {/* ── LEFT: form fields ─────────────────────────────────────── */}
                        <div className="space-y-5">

                            {/* Details card */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                                    <Building2 size={15} className="text-brand-600" />
                                    Warehouse Details
                                </h2>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Name */}
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            Warehouse Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="e.g. Bhiwandi Hub"
                                            required
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-300"
                                        />
                                    </div>

                                    {/* Code */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            Short Code
                                        </label>
                                        <input
                                            value={code}
                                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                                            placeholder="BHW-01"
                                            maxLength={12}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono placeholder:text-slate-300"
                                        />
                                    </div>

                                    {/* Region */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            Region
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={region}
                                                onChange={(e) => setRegion(e.target.value)}
                                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white pr-8"
                                            >
                                                <option value="">— select —</option>
                                                {regions.map((r) => (
                                                    <option key={r.id} value={r.id}>{r.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* City */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            City <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            placeholder="e.g. Bhiwandi"
                                            required
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-300"
                                        />
                                    </div>

                                    {/* State */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            State <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            value={state}
                                            onChange={(e) => setState(e.target.value)}
                                            placeholder="e.g. Maharashtra"
                                            required
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-300"
                                        />
                                    </div>

                                    {/* Address */}
                                    <div className="col-span-2">
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            Full Address
                                        </label>
                                        <textarea
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Street address…"
                                            rows={2}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Coordinates display */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
                                    <MapPin size={15} className="text-brand-600" />
                                    Pinned Location
                                </h2>
                                {lat && lng ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 rounded-xl p-3 text-center">
                                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Latitude</p>
                                            <p className="text-sm font-mono font-semibold text-slate-800">{lat.toFixed(6)}</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-3 text-center">
                                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Longitude</p>
                                            <p className="text-sm font-mono font-semibold text-slate-800">{lng.toFixed(6)}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-slate-400 text-sm py-1">
                                        <MapPin size={14} />
                                        <span>Click the map or use current location to pin coordinates</span>
                                    </div>
                                )}
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={saving || !name || !city || !state}
                                className="w-full py-3 px-6 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                            >
                                {saving
                                    ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                                    : "Create Warehouse"}
                            </button>
                        </div>

                        {/* ── RIGHT: Map picker ─────────────────────────────────────── */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ minHeight: 520 }}>
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin size={14} className="text-brand-600" />
                                    <h2 className="text-sm font-semibold text-slate-800">Pin Warehouse Location</h2>
                                </div>
                                <span className="text-[11px] text-slate-400">Click map · search · or use GPS</span>
                            </div>
                            <div style={{ height: 480 }}>
                                <WarehouseLocationPicker
                                    onLocationPicked={handleLocationPicked}
                                    currentLat={lat}
                                    currentLng={lng}
                                />
                            </div>
                        </div>

                    </div>
                </form>
            </div>

            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50
            ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
                >
                    {toast.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {toast.msg}
                </div>
            )}
        </div>
    );
}