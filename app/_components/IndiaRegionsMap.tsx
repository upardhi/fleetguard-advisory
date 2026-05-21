"use client";
/**
 * IndiaRegionsMap
 *
 * React-Leaflet map showing ITC's 4 ops regions (North / East / West / South)
 * with depot-city markers and live disruption risk colouring.
 *
 * Must be imported with `{ ssr: false }` via next/dynamic — Leaflet requires
 * the browser `window` object.
 */
import "leaflet/dist/leaflet.css";
import {
  MapContainer, TileLayer, CircleMarker, Tooltip, Popup, ZoomControl,
} from "react-leaflet";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CityEntry {
  id: string;
  name: string;
  state: string | null;
  is_depot: boolean;
  region_id: string;
}

export interface RegionMapData {
  id: string;
  label: string;
  worstRisk: string;
  disruptions: number;
  critical: number;
  high: number;
  corridors: number;
  cities: number;
  cityList: CityEntry[];
}

// ── Region visual config ──────────────────────────────────────────────────────

const REGION_CFG: Record<string, {
  color: string; fill: string; center: [number, number]; approxRadius: number;
}> = {
  north: { color: "#2563eb", fill: "#3b82f6", center: [29.5,  77.5],  approxRadius: 520_000 },
  east:  { color: "#ea580c", fill: "#f97316", center: [23.0,  87.5],  approxRadius: 480_000 },
  west:  { color: "#7c3aed", fill: "#8b5cf6", center: [21.5,  74.0],  approxRadius: 540_000 },
  south: { color: "#059669", fill: "#10b981", center: [13.0,  78.5],  approxRadius: 490_000 },
};

const RISK_STROKE: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      "#3b82f6",
  safe:     "#10b981",
};

// ── City coordinate lookup ────────────────────────────────────────────────────
// ~150 major Indian depot cities. Unlisted cities fall back to state centroid.

const CITY_COORDS: Record<string, [number, number]> = {
  // North
  "Delhi": [28.7041, 77.1025],          "New Delhi": [28.6139, 77.2090],
  "Noida": [28.5355, 77.3910],          "Greater Noida": [28.4744, 77.5040],
  "Gurgaon": [28.4595, 77.0266],        "Gurugram": [28.4595, 77.0266],
  "Faridabad": [28.4089, 77.3178],      "Ghaziabad": [28.6692, 77.4538],
  "Chandigarh": [30.7333, 76.7794],     "Ludhiana": [30.9010, 75.8573],
  "Amritsar": [31.6340, 74.8723],       "Jalandhar": [31.3260, 75.5762],
  "Patiala": [30.3398, 76.3869],        "Ambala": [30.3782, 76.7767],
  "Hisar": [29.1492, 75.7217],          "Rohtak": [28.8955, 76.6066],
  "Jaipur": [26.9124, 75.7873],         "Jodhpur": [26.2389, 73.0243],
  "Udaipur": [24.5854, 73.7125],        "Ajmer": [26.4521, 74.6399],
  "Kota": [25.2138, 75.8648],           "Bikaner": [28.0229, 73.3119],
  "Agra": [27.1767, 78.0081],           "Mathura": [27.4924, 77.6737],
  "Lucknow": [26.8467, 80.9462],        "Kanpur": [26.4499, 80.3319],
  "Varanasi": [25.3176, 82.9739],       "Prayagraj": [25.4358, 81.8463],
  "Allahabad": [25.4358, 81.8463],      "Meerut": [28.9845, 77.7064],
  "Aligarh": [27.8974, 78.0880],        "Moradabad": [28.8386, 78.7733],
  "Bareilly": [28.3670, 79.4304],       "Gorakhpur": [26.7606, 83.3732],
  "Dehradun": [30.3165, 78.0322],       "Haridwar": [29.9457, 78.1642],
  "Shimla": [31.1048, 77.1734],         "Jammu": [32.7266, 74.8570],
  "Srinagar": [34.0837, 74.7973],
  // East
  "Kolkata": [22.5726, 88.3639],        "Howrah": [22.5958, 88.2636],
  "Durgapur": [23.5204, 87.3119],       "Asansol": [23.6833, 86.9833],
  "Siliguri": [26.7271, 88.3953],       "Kharagpur": [22.3460, 87.3233],
  "Bhubaneswar": [20.2961, 85.8245],    "Cuttack": [20.4625, 85.8828],
  "Sambalpur": [21.4669, 83.9757],      "Rourkela": [22.2604, 84.8536],
  "Berhampur": [19.3150, 84.7941],
  "Patna": [25.5941, 85.1376],          "Gaya": [24.7914, 85.0002],
  "Muzaffarpur": [26.1209, 85.3647],    "Bhagalpur": [25.2540, 87.0130],
  "Ranchi": [23.3441, 85.3096],         "Jamshedpur": [22.8046, 86.2029],
  "Dhanbad": [23.7957, 86.4304],        "Bokaro": [23.6693, 86.1511],
  "Guwahati": [26.1445, 91.7362],       "Dibrugarh": [27.4728, 94.9120],
  "Shillong": [25.5788, 91.8933],       "Agartala": [23.8315, 91.2868],
  "Imphal": [24.8170, 93.9368],
  "Raipur": [21.2514, 81.6296],         "Bilaspur": [22.0796, 82.1391],
  // West
  "Mumbai": [19.0760, 72.8777],         "Thane": [19.2183, 72.9781],
  "Navi Mumbai": [19.0368, 73.0158],    "Pune": [18.5204, 73.8567],
  "Nashik": [19.9975, 73.7898],         "Nagpur": [21.1458, 79.0882],
  "Aurangabad": [19.8762, 75.3433],     "Solapur": [17.6805, 75.9064],
  "Kolhapur": [16.7050, 74.2433],       "Amravati": [20.9333, 77.7500],
  "Sangli": [16.8524, 74.5815],         "Latur": [18.4088, 76.5604],
  "Jalgaon": [21.0077, 75.5626],        "Akola": [20.7002, 77.0082],
  "Ahmednagar": [19.0948, 74.7480],
  "Ahmedabad": [23.0225, 72.5714],      "Surat": [21.1702, 72.8311],
  "Vadodara": [22.3072, 73.1812],       "Rajkot": [22.3039, 70.8022],
  "Bhavnagar": [21.7645, 72.1519],      "Jamnagar": [22.4707, 70.0577],
  "Gandhinagar": [23.2156, 72.6369],    "Anand": [22.5645, 72.9289],
  "Bhopal": [23.2599, 77.4126],         "Indore": [22.7196, 75.8577],
  "Gwalior": [26.2183, 78.1828],        "Jabalpur": [23.1815, 79.9864],
  "Ujjain": [23.1793, 75.7849],
  "Goa": [15.2993, 74.1240],            "Panaji": [15.4909, 73.8278],
  // South
  "Chennai": [13.0827, 80.2707],        "Coimbatore": [11.0168, 76.9558],
  "Madurai": [9.9252, 78.1198],         "Tiruchirappalli": [10.7905, 78.7047],
  "Trichy": [10.7905, 78.7047],         "Salem": [11.6643, 78.1460],
  "Erode": [11.3410, 77.7172],          "Tirunelveli": [8.7139, 77.7567],
  "Vellore": [12.9165, 79.1325],        "Pondicherry": [11.9416, 79.8083],
  "Puducherry": [11.9416, 79.8083],
  "Bangalore": [12.9716, 77.5946],      "Bengaluru": [12.9716, 77.5946],
  "Mysuru": [12.2958, 76.6394],         "Mysore": [12.2958, 76.6394],
  "Mangalore": [12.9141, 74.8560],      "Mangaluru": [12.9141, 74.8560],
  "Hubli": [15.3647, 75.1240],          "Dharwad": [15.4589, 75.0078],
  "Belagavi": [15.8497, 74.4977],       "Belgaum": [15.8497, 74.4977],
  "Bellary": [15.1394, 76.9214],        "Shimoga": [13.9299, 75.5681],
  "Kalaburagi": [17.3297, 76.8343],     "Gulbarga": [17.3297, 76.8343],
  "Hyderabad": [17.3850, 78.4867],      "Secunderabad": [17.4399, 78.4983],
  "Warangal": [17.9784, 79.5941],       "Nizamabad": [18.6725, 78.0941],
  "Karimnagar": [18.4386, 79.1288],     "Khammam": [17.2473, 80.1514],
  "Vijayawada": [16.5062, 80.6480],     "Visakhapatnam": [17.6868, 83.2185],
  "Vizag": [17.6868, 83.2185],          "Guntur": [16.3067, 80.4365],
  "Nellore": [14.4426, 79.9865],        "Tirupati": [13.6288, 79.4192],
  "Rajahmundry": [17.0005, 81.8040],    "Kakinada": [16.9891, 82.2475],
  "Kurnool": [15.8281, 78.0373],        "Anantapur": [14.6819, 77.6006],
  "Kochi": [9.9312, 76.2673],           "Thiruvananthapuram": [8.5241, 76.9366],
  "Trivandrum": [8.5241, 76.9366],      "Kozhikode": [11.2588, 75.7804],
  "Calicut": [11.2588, 75.7804],        "Thrissur": [10.5276, 76.2144],
  "Kollam": [8.8932, 76.6141],          "Palakkad": [10.7867, 76.6548],
  "Kannur": [11.8745, 75.3704],
};

// State centroids as fallback when city name isn't in the lookup
const STATE_CENTROIDS: Record<string, [number, number]> = {
  "Andhra Pradesh": [15.9129, 79.7400],   "Arunachal Pradesh": [27.1004, 93.6166],
  "Assam": [26.2006, 92.9376],            "Bihar": [25.0961, 85.3131],
  "Chhattisgarh": [21.2787, 81.8661],     "Delhi": [28.7041, 77.1025],
  "Goa": [15.2993, 74.1240],              "Gujarat": [22.2587, 71.1924],
  "Haryana": [29.0588, 76.0856],          "Himachal Pradesh": [31.1048, 77.1734],
  "Jharkhand": [23.6102, 85.2799],        "Karnataka": [15.3173, 75.7139],
  "Kerala": [10.8505, 76.2711],           "Madhya Pradesh": [22.9734, 78.6569],
  "Maharashtra": [19.7515, 75.7139],      "Manipur": [24.6637, 93.9063],
  "Meghalaya": [25.4670, 91.3662],        "Mizoram": [23.1645, 92.9376],
  "Nagaland": [26.1584, 94.5624],         "Odisha": [20.9517, 85.0985],
  "Punjab": [31.1471, 75.3412],           "Rajasthan": [27.0238, 74.2179],
  "Sikkim": [27.5330, 88.5122],           "Tamil Nadu": [11.1271, 78.6569],
  "Telangana": [17.1232, 79.2088],        "Tripura": [23.9408, 91.9882],
  "Uttar Pradesh": [26.8467, 80.9462],    "Uttarakhand": [30.0668, 79.0193],
  "West Bengal": [22.9868, 87.8550],      "Jammu & Kashmir": [33.5574, 75.0700],
  "Ladakh": [34.1526, 77.5770],           "Puducherry": [11.9416, 79.8083],
  "Chandigarh": [30.7333, 76.7794],       "Jharkand": [23.6102, 85.2799],
};

function getCityCoords(name: string, state: string | null): [number, number] | null {
  // Exact match
  if (CITY_COORDS[name]) return CITY_COORDS[name];
  // Case-insensitive
  const lo = name.toLowerCase();
  for (const [k, v] of Object.entries(CITY_COORDS)) {
    if (k.toLowerCase() === lo) return v;
  }
  // State centroid fallback
  if (state) {
    const slo = state.toLowerCase();
    for (const [k, v] of Object.entries(STATE_CENTROIDS)) {
      if (k.toLowerCase() === slo) return v;
    }
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  regions: RegionMapData[];
}

export default function IndiaRegionsMap({ regions }: Props) {
  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <MapContainer
        center={[20.8, 79.0]}
        zoom={5}
        zoomControl={false}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", background: "#f8fafc" }}
        maxBounds={[[4, 62], [38, 100]]}
        minZoom={4}
        maxZoom={10}
      >
        {/* Clean light tile layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          subdomains="abcd"
        />
        <ZoomControl position="bottomright" />

        {/* Region territory bubbles — large translucent circles */}
        {regions.map((region) => {
          const cfg = REGION_CFG[region.id];
          if (!cfg) return null;
          const hasDisruptions = region.disruptions > 0;
          const strokeColor = hasDisruptions
            ? (RISK_STROKE[region.worstRisk] ?? cfg.color)
            : cfg.color;

          return (
            <CircleMarker
              key={`zone-${region.id}`}
              center={cfg.center}
              // radius in pixels — kept modest, big territories are contextual
              radius={hasDisruptions ? 44 : 38}
              pathOptions={{
                color: strokeColor,
                fillColor: cfg.fill,
                fillOpacity: hasDisruptions ? 0.12 : 0.08,
                weight: hasDisruptions ? 2.5 : 1.5,
                dashArray: hasDisruptions ? undefined : "4 4",
              }}
            >
              {/* Permanent label */}
              <Tooltip
                permanent
                direction="center"
                offset={[0, 0]}
                className="region-zone-label"
              >
                <span style={{ fontWeight: 700, fontSize: 11, color: cfg.color, letterSpacing: "0.04em" }}>
                  {region.label.toUpperCase()}
                </span>
              </Tooltip>

              {/* Click popup with stats */}
              <Popup offset={[0, -10]} closeButton={false}>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: cfg.color, marginBottom: 6 }}>
                    {region.label} Region
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12, color: "#475569" }}>
                    <span>Disruptions</span>
                    <span style={{ fontWeight: 700, color: region.disruptions > 0 ? "#dc2626" : "#10b981" }}>
                      {region.disruptions > 0 ? region.disruptions : "✓ Clear"}
                    </span>
                    {region.critical > 0 && <>
                      <span>Critical</span>
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>{region.critical}</span>
                    </>}
                    <span>Corridors</span>
                    <span style={{ fontWeight: 600 }}>{region.corridors}</span>
                    <span>Depot Cities</span>
                    <span style={{ fontWeight: 600 }}>{region.cities}</span>
                  </div>
                  <a
                    href={`/advisory/regions/${region.id}`}
                    style={{ display: "inline-block", marginTop: 10, fontSize: 11, color: cfg.color, fontWeight: 600 }}
                  >
                    Open Region →
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* City markers */}
        {regions.flatMap((region) => {
          const cfg = REGION_CFG[region.id];
          if (!cfg) return [];

          return (region.cityList ?? []).flatMap((city) => {
            const coords = getCityCoords(city.name, city.state);
            if (!coords) return [];

            const r = city.is_depot ? 6 : 4;

            return [
              <CircleMarker
                key={city.id}
                center={coords}
                radius={r}
                pathOptions={{
                  color: cfg.color,
                  fillColor: cfg.fill,
                  fillOpacity: 0.9,
                  weight: 1.5,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: "#1e293b" }}>{city.name}</div>
                    {city.state && (
                      <div style={{ color: "#64748b", fontSize: 11 }}>{city.state}</div>
                    )}
                    <div style={{ color: cfg.color, fontSize: 11, marginTop: 2 }}>
                      {region.label} Region
                      {city.is_depot ? " · Depot" : ""}
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>,
            ];
          });
        })}
      </MapContainer>

      {/* Legend overlay */}
      <div className="absolute bottom-10 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-slate-200 px-3 py-2.5 space-y-1.5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Regions</p>
        {regions.map((region) => {
          const cfg = REGION_CFG[region.id];
          if (!cfg) return null;
          return (
            <a
              key={region.id}
              href={`/advisory/regions/${region.id}`}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: cfg.fill }}
              />
              <span className="text-[11px] font-semibold text-slate-700">{region.label}</span>
              {region.disruptions > 0 && (
                <span
                  className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: RISK_STROKE[region.worstRisk] + "20", color: RISK_STROKE[region.worstRisk] }}
                >
                  {region.disruptions}
                </span>
              )}
            </a>
          );
        })}
        <div className="border-t border-slate-100 mt-1.5 pt-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Markers</p>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-full border-2 border-slate-400 bg-slate-300 inline-block" />
            Depot city
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
            <span className="w-2 h-2 rounded-full border border-slate-300 bg-slate-200 inline-block" />
            Branch city
          </div>
        </div>
      </div>
    </div>
  );
}
