"use client";
/**
 * WarehouseLocationPicker
 *
 * Leaflet map that lets a user:
 *  1. Click anywhere to drop a pin
 *  2. Search a city/address (Nominatim — no API key needed)
 *  3. Use browser GPS ("current location")
 *
 * Reverse-geocodes the picked point via Nominatim and calls `onLocationPicked`
 * with lat, lng, city, state, and formatted address.
 *
 * Must be loaded with { ssr: false } — Leaflet requires the browser window.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import {
  MapContainer, TileLayer, Marker, ZoomControl, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Crosshair, Loader2, Search, X } from "lucide-react";

// ── Fix Leaflet default icon (broken in Next.js) ─────────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom red pin for warehouse
const WAREHOUSE_ICON = new L.Icon({
  iconUrl:       "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize:      [25, 41],
  iconAnchor:    [12, 41],
  popupAnchor:   [1, -34],
  shadowSize:    [41, 41],
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

export interface PickedLocation {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  address?: string;
}

interface Props {
  onLocationPicked: (loc: PickedLocation) => void;
  currentLat: number | null;
  currentLng: number | null;
}

// ─── Inner click handler (must be inside MapContainer) ───────────────────────

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

// ─── Nominatim helpers ────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<Omit<PickedLocation, "lat" | "lng">> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = (await res.json()) as NominatimResult;
    const addr = data.address ?? {};
    return {
      city:    addr.city ?? addr.town ?? addr.village,
      state:   addr.state,
      address: data.display_name,
    };
  } catch {
    return {};
  }
}

async function searchPlace(query: string): Promise<NominatimResult[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", India")}&format=json&limit=5&addressdetails=1`,
    { headers: { "Accept-Language": "en" } },
  );
  return res.json() as Promise<NominatimResult[]>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WarehouseLocationPicker({ onLocationPicked, currentLat, currentLng }: Props) {
  const [pinPos,      setPinPos]      = useState<[number, number] | null>(
    currentLat && currentLng ? [currentLat, currentLng] : null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [results,     setResults]     = useState<NominatimResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [locating,    setLocating]    = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // When parent clears pin (e.g. form reset)
  useEffect(() => {
    if (!currentLat || !currentLng) setPinPos(null);
  }, [currentLat, currentLng]);

  async function handlePick(lat: number, lng: number) {
    setPinPos([lat, lng]);
    setResults([]);
    const geo = await reverseGeocode(lat, lng);
    onLocationPicked({ lat, lng, ...geo });
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const hits = await searchPlace(searchQuery);
      if (hits.length === 1) {
        // Single result — pick it immediately
        await pickResult(hits[0]);
      } else {
        setResults(hits);
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }

  async function pickResult(r: NominatimResult) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setPinPos([lat, lng]);
    setResults([]);
    setSearchQuery("");
    mapRef.current?.setView([lat, lng], 14);
    const addr = r.address ?? {};
    onLocationPicked({
      lat, lng,
      city:    addr.city ?? addr.town ?? addr.village,
      state:   addr.state,
      address: r.display_name,
    });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        mapRef.current?.setView([lat, lng], 15);
        await handlePick(lat, lng);
        setLocating(false);
      },
      () => setLocating(false),
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/80 z-10 relative">
        {/* Search input */}
        <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setResults([]); }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
            placeholder="Search city or address…"
            className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-slate-300"
          />
          {searchQuery && (
            <button type="button" onClick={() => { setSearchQuery(""); setResults([]); }}>
              <X size={11} className="text-slate-400" />
            </button>
          )}
          {searching && <Loader2 size={11} className="animate-spin text-slate-400 shrink-0" />}
        </div>

        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg transition disabled:opacity-40 shadow-sm"
        >
          Go
        </button>

        {/* GPS button */}
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg transition disabled:opacity-50 shadow-sm whitespace-nowrap"
        >
          {locating ? <Loader2 size={12} className="animate-spin" /> : <Crosshair size={12} />}
          {locating ? "Locating…" : "My location"}
        </button>
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div className="absolute top-[52px] left-3 right-3 z-[2000] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickResult(r)}
              className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 transition border-b border-slate-100 last:border-0"
            >
              <p className="font-medium text-slate-800 line-clamp-1">{r.display_name}</p>
              {r.address?.state && (
                <p className="text-slate-400 mt-0.5">{r.address.state}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={pinPos ?? [22.5, 80.0]}
          zoom={pinPos ? 14 : 5}
          zoomControl={false}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
          ref={mapRef}
          maxBounds={[[4, 62], [38, 100]]}
          minZoom={4}
          maxZoom={18}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            subdomains="abcd"
          />
          <ZoomControl position="bottomright" />
          <MapClickHandler onPick={handlePick} />
          {pinPos && (
            <Marker position={pinPos} icon={WAREHOUSE_ICON} />
          )}
        </MapContainer>

        {/* Click hint */}
        {!pinPos && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-4 py-2 text-xs text-slate-500 shadow-sm pointer-events-none whitespace-nowrap">
            Click anywhere on the map to pin the warehouse location
          </div>
        )}
      </div>
    </div>
  );
}