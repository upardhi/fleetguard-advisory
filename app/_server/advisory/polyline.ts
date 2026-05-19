/**
 * Google encoded-polyline utilities.
 * Used to decode route geometry and sample evenly-spaced points along it
 * for reverse geocoding (district / tehsil discovery).
 */

export type LatLng = [number, number];

/** Decode a Google encoded polyline string into an array of [lat, lng]. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat * 1e-5, lng * 1e-5]);
  }
  return points;
}

/** Great-circle distance between two points in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Sample points along a path roughly every `everyKm` kilometres.
 * Always includes the first and last point. Caps total samples so a very
 * long route doesn't trigger hundreds of geocoding calls.
 */
export function samplePath(path: LatLng[], everyKm = 12, maxSamples = 60): LatLng[] {
  if (path.length === 0) return [];
  if (path.length === 1) return [path[0]];

  const out: LatLng[] = [path[0]];
  let accumulated = 0;

  for (let i = 1; i < path.length; i++) {
    accumulated += haversineKm(path[i - 1], path[i]);
    if (accumulated >= everyKm) {
      out.push(path[i]);
      accumulated = 0;
    }
  }
  const last = path[path.length - 1];
  if (out[out.length - 1] !== last) out.push(last);

  // Downsample if we exceeded the cap.
  if (out.length > maxSamples) {
    const step = Math.ceil(out.length / maxSamples);
    return out.filter((_, i) => i % step === 0 || i === out.length - 1);
  }
  return out;
}
