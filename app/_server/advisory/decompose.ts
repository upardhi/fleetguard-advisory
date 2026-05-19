/**
 * Route decomposition — given a route's geometry, produce the ordered list of
 * districts, tehsils and highways it crosses. These segments are what the
 * news pipeline searches against.
 */

import { decodePolyline, samplePath } from "./polyline";
import { reverseGeocode } from "./google";

export interface RouteSegment {
  segmentType: "district" | "tehsil" | "national_highway" | "state_highway";
  name: string;
  state?: string;
  seq: number;
  lat?: number;
  lng?: number;
}

/**
 * Decompose a route into geographic segments.
 * - Districts / tehsils: sampled points along the polyline, reverse-geocoded.
 * - Highways: passed in from the Directions step parsing.
 *
 * Reverse-geocode calls run sequentially with a small concurrency window to
 * stay within Google's per-second quota.
 */
export async function decomposeRoute(
  polyline: string,
  highways: string[],
): Promise<RouteSegment[]> {
  const path = decodePolyline(polyline);
  const samples = samplePath(path, 12, 60);

  const segments: RouteSegment[] = [];
  let seq = 0;

  // Highways first (ordered as discovered).
  for (const hw of highways) {
    segments.push({
      segmentType: hw.startsWith("NH") ? "national_highway" : "state_highway",
      name: hw,
      seq: seq++,
    });
  }

  // Geocode samples with limited concurrency (5 at a time).
  const seenDistrict = new Set<string>();
  const seenTehsil = new Set<string>();
  const CONCURRENCY = 5;

  for (let i = 0; i < samples.length; i += CONCURRENCY) {
    const batch = samples.slice(i, i + CONCURRENCY);
    const areas = await Promise.all(
      batch.map(([lat, lng]) =>
        reverseGeocode(lat, lng)
          .then((a) => ({ a, lat, lng }))
          .catch(() => ({ a: {} as Awaited<ReturnType<typeof reverseGeocode>>, lat, lng })),
      ),
    );

    for (const { a, lat, lng } of areas) {
      if (a.district && !seenDistrict.has(a.district)) {
        seenDistrict.add(a.district);
        segments.push({
          segmentType: "district",
          name: a.district,
          state: a.state,
          seq: seq++,
          lat,
          lng,
        });
      }
      if (a.tehsil && !seenTehsil.has(a.tehsil)) {
        seenTehsil.add(a.tehsil);
        segments.push({
          segmentType: "tehsil",
          name: a.tehsil,
          state: a.state,
          seq: seq++,
          lat,
          lng,
        });
      }
    }
  }

  return segments;
}

/**
 * Build the Firecrawl search query for a segment. Tuned to surface
 * transport-affecting news for the coming days.
 */
export function segmentSearchQuery(seg: { name: string; state?: string }): string {
  const place = seg.state ? `${seg.name} ${seg.state}` : seg.name;
  return `${place} road OR highway bandh OR accident OR flood OR protest OR roadblock news`;
}
