/**
 * Google Maps clients — Directions API (route discovery) and
 * Geocoding API (reverse geocoding for district / tehsil).
 *
 * Both APIs must be enabled on the project that owns the key.
 * Key resolution: GOOGLE_MAPS_API_KEY, then GOOGLE_CLOUD_VISION_API_KEY
 * as a fallback (same Google Cloud project often shares one key).
 */

function googleKey(): string {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_CLOUD_VISION_API_KEY ??
    "";
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

// ── Directions ────────────────────────────────────────────────────────────────

export interface DirectionsRoute {
  summary: string;
  distanceKm: number;
  durationHours: number;
  polyline: string;
  highways: string[];
}

/** Strip HTML tags from a Google `html_instructions` string. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Pull NH / SH highway references out of free text. */
function extractHighways(text: string): string[] {
  const found = new Set<string>();
  // NH 12, NH-12, NH12A, National Highway 44
  const nh = text.matchAll(/\b(?:NH|National Highway)\s*-?\s*(\d+[A-Z]?)\b/gi);
  for (const m of nh) found.add(`NH${m[1].toUpperCase()}`);
  const sh = text.matchAll(/\b(?:SH|State Highway)\s*-?\s*(\d+[A-Z]?)\b/gi);
  for (const m of sh) found.add(`SH${m[1].toUpperCase()}`);
  return [...found];
}

interface GDirectionsResponse {
  status: string;
  error_message?: string;
  routes: Array<{
    summary: string;
    overview_polyline: { points: string };
    legs: Array<{
      distance: { value: number };
      duration: { value: number };
      steps: Array<{ html_instructions?: string }>;
    }>;
  }>;
}

/**
 * Fetch up to 3 alternative routes between two places.
 * `origin` / `destination` can be place names ("Kolkata") or "lat,lng".
 */
export async function getDirections(
  origin: string,
  destination: string,
): Promise<DirectionsRoute[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("region", "in");
  url.searchParams.set("key", googleKey());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Directions API HTTP ${res.status}`);
  const data = (await res.json()) as GDirectionsResponse;

  if (data.status !== "OK") {
    throw new Error(
      `Directions API: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
    );
  }

  return data.routes.slice(0, 3).map((r) => {
    const distanceM = r.legs.reduce((s, l) => s + l.distance.value, 0);
    const durationS = r.legs.reduce((s, l) => s + l.duration.value, 0);
    const instructionText = r.legs
      .flatMap((l) => l.steps.map((st) => stripHtml(st.html_instructions ?? "")))
      .join(" ");
    return {
      summary: r.summary || "Route",
      distanceKm: Math.round(distanceM / 100) / 10,
      durationHours: Math.round((durationS / 3600) * 100) / 100,
      polyline: r.overview_polyline.points,
      highways: extractHighways(`${r.summary} ${instructionText}`),
    };
  });
}

// ── Reverse geocoding ─────────────────────────────────────────────────────────

export interface GeoArea {
  state?: string;
  district?: string;
  tehsil?: string;
}

interface GGeocodeResponse {
  status: string;
  results: Array<{
    address_components: Array<{ long_name: string; types: string[] }>;
  }>;
}

/**
 * Reverse-geocode a coordinate to its Indian admin areas.
 * administrative_area_level_1 = state, level_2 = district, level_3 = tehsil/taluka.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoArea> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("result_type", "administrative_area_level_3|administrative_area_level_2|administrative_area_level_1");
  url.searchParams.set("key", googleKey());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Geocoding API HTTP ${res.status}`);
  const data = (await res.json()) as GGeocodeResponse;
  if (data.status !== "OK" || data.results.length === 0) return {};

  const area: GeoArea = {};
  for (const result of data.results) {
    for (const c of result.address_components) {
      if (!area.state && c.types.includes("administrative_area_level_1")) area.state = c.long_name;
      if (!area.district && c.types.includes("administrative_area_level_2")) area.district = c.long_name;
      if (!area.tehsil && c.types.includes("administrative_area_level_3")) area.tehsil = c.long_name;
    }
  }
  return area;
}
