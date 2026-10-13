// lib/openroute.ts
// Thin wrapper around OpenRouteService Geocoding + Directions APIs.
// Put your key in .env.local  ->  NEXT_PUBLIC_ORS_API_KEY=xxxx
// (If you use Vite: import.meta.env.VITE_ORS_API_KEY instead.)
// Restart the dev server after changing .env.local.

const KEY = process.env.NEXT_PUBLIC_ORS_API_KEY ?? '';
const BASE = 'https://api.openrouteservice.org';

export type TravelMode = 'driving' | 'walking' | 'cycling';

export interface Place {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface RouteStep {
  message: string;
  distanceFromStart: number; // meters
  lat: number;
  lon: number;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  departureTime?: string;
  arrivalTime?: string; // computed client-side (ORS does not return it)
  /** [lon, lat] pairs, ready for GeoJSON / MapLibre (flip for Leaflet) */
  coordinates: [number, number][];
  steps: RouteStep[];
}

// ORS profile names for our modes
const ORS_PROFILE: Record<TravelMode, string> = {
  driving: 'driving-car',
  walking: 'foot-walking',
  cycling: 'cycling-regular',
};

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message ?? j?.error ?? j?.geocoding?.errors?.[0] ?? '';
  } catch {
    return '';
  }
}

/** Place search (autocomplete). Optionally biased near a point and limited to a country. */
export async function searchPlaces(
  query: string,
  opts: { near?: { lat: number; lon: number }; signal?: AbortSignal; countrySet?: string } = {}
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (!KEY) throw new Error('OpenRouteService API key is missing (NEXT_PUBLIC_ORS_API_KEY).');

  const params = new URLSearchParams({ api_key: KEY, text: q, size: '6' });
  if (opts.near && isNum(opts.near.lat) && isNum(opts.near.lon)) {
    params.set('focus.point.lat', String(opts.near.lat));
    params.set('focus.point.lon', String(opts.near.lon));
  }
  // ORS expects ISO alpha-2/alpha-3, e.g. 'PH'
  if (opts.countrySet) params.set('boundary.country', opts.countrySet);

  const res = await fetch(`${BASE}/geocode/autocomplete?${params}`, { signal: opts.signal });
  if (res.status === 401 || res.status === 403) {
    throw new Error('OpenRouteService rejected the API key.');
  }
  if (res.status === 429) throw new Error('OpenRouteService rate limit reached. Try again shortly.');
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = await res.json();

  return (data.features ?? [])
    .filter((f: any) => Array.isArray(f.geometry?.coordinates))
    .map((f: any): Place => ({
      name: f.properties?.name ?? f.properties?.label ?? 'Unnamed place',
      address: f.properties?.label ?? '',
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
}

/** Reverse geocode a clicked map point into a Place (used by "pick on map"). */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<Place | null> {
  if (!KEY) throw new Error('OpenRouteService API key is missing (NEXT_PUBLIC_ORS_API_KEY).');
  const params = new URLSearchParams({
    api_key: KEY,
    'point.lat': String(lat),
    'point.lon': String(lon),
    size: '1',
  });
  const res = await fetch(`${BASE}/geocode/reverse?${params}`, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const f = data.features?.[0];
  if (!f) return null;
  return {
    name: f.properties?.name ?? f.properties?.label ?? 'Picked location',
    address: f.properties?.label ?? '',
    lat,
    lon,
  };
}

async function requestDirections(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mode: TravelMode,
  withAlternatives: boolean,
  signal?: AbortSignal
): Promise<Response> {
  const body: Record<string, unknown> = {
    coordinates: [
      [from.lon, from.lat], // ORS wants [lon, lat]
      [to.lon, to.lat],
    ],
    instructions: true,
    language: 'en',
  };
  if (withAlternatives) {
    body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.4 };
  }

  return fetch(`${BASE}/v2/directions/${ORS_PROFILE[mode]}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: KEY,
      'Content-Type': 'application/json',
      Accept: 'application/geo+json, application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

/** Calculate up to 3 routes (1 best + up to 2 alternatives). */
export async function getRoutes(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mode: TravelMode,
  signal?: AbortSignal
): Promise<RouteResult[]> {
  if (!KEY) throw new Error('OpenRouteService API key is missing (NEXT_PUBLIC_ORS_API_KEY).');
  if (![from.lat, from.lon, to.lat, to.lon].every(isNum)) {
    throw new Error('Start or destination has no valid coordinates.');
  }

  let res = await requestDirections(from, to, mode, true, signal);

  // Alternatives are limited (e.g. max ~100 km). Retry with a single route if rejected.
  if (res.status === 400) {
    res = await requestDirections(from, to, mode, false, signal);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('OpenRouteService rejected the API key.');
  }
  if (res.status === 429) throw new Error('OpenRouteService rate limit reached. Try again shortly.');
  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(detail || `Routing failed (${res.status})`);
  }

  const data = await res.json();
  const departure = new Date();

  return (data.features ?? []).slice(0, 3).map((f: any): RouteResult => {
    const coordinates: [number, number][] = (f.geometry?.coordinates ?? []).map(
      (c: number[]): [number, number] => [c[0], c[1]]
    );
    const summary = f.properties?.summary ?? { distance: 0, duration: 0 };

    // Flatten steps across segments, accumulating distance from start
    let offset = 0;
    const steps: RouteStep[] = [];
    for (const seg of f.properties?.segments ?? []) {
      for (const s of seg.steps ?? []) {
        const wp = s.way_points?.[0];
        const pt = isNum(wp) ? coordinates[wp] : undefined;
        steps.push({
          message: s.instruction ?? '',
          distanceFromStart: offset,
          lon: pt?.[0] as number,
          lat: pt?.[1] as number,
        });
        offset += s.distance ?? 0;
      }
    }

    return {
      distanceM: summary.distance,
      durationS: summary.duration,
      departureTime: departure.toISOString(),
      arrivalTime: new Date(departure.getTime() + summary.duration * 1000).toISOString(),
      coordinates,
      steps,
    };
  });
}

// ---------- formatting helpers ----------

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function formatDuration(s: number): string {
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatClock(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
