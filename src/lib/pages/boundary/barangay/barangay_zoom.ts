// FILE: src/lib/pages/boundary/barangay/barangay_zoom.ts
import * as maplibregl from "maplibre-gl";

const SOURCE_ID = "barangay-bndry";
const SOURCE_LAYER = "barangay";
const TAG = "[zoomToBarangay]";

// The barangay layer is only drawn from this zoom, so never zoom out below it
// (keep in sync with MIN_ZOOM in barangay_layer.tsx)
const MIN_ZOOM = 12;

// Walk any GeoJSON coordinates array and grow the bounds
function extendWithCoords(bounds: maplibregl.LngLatBounds, coords: any): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    bounds.extend([coords[0], coords[1]]);
    return;
  }
  coords.forEach((c) => extendWithCoords(bounds, c));
}

// EPSG:3857 (meters) -> lng/lat
const R = 6378137;
const mercToLng = (x: number) => (x / R) * (180 / Math.PI);
const mercToLat = (y: number) =>
  (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);

/**
 * Accepts [minLng, minLat, maxLng, maxLat] (numbers or numeric strings), or a JSON string of it.
 * Returns [minLng, minLat, maxLng, maxLat] or null when it can't be understood.
 */
function parseBbox(raw: unknown): [number, number, number, number] | null {
  let arr: unknown = raw;

  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  if (arr.some((v) => v === null || v === undefined || v === "")) return null;

  let [minX, minY, maxX, maxY] = arr.map((v) => Number(v));
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

  // Values outside lng/lat range -> probably EPSG:3857 (SQL forgot ST_Transform(..., 4326))
  if (Math.max(Math.abs(minX), Math.abs(maxX)) > 180 || Math.max(Math.abs(minY), Math.abs(maxY)) > 90) {
    console.warn(`${TAG} bbox looks like EPSG:3857, converting to lng/lat`, raw);
    [minX, maxX] = [mercToLng(minX), mercToLng(maxX)];
    [minY, maxY] = [mercToLat(minY), mercToLat(maxY)];
  }
  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  return [minX, minY, maxX, maxY];
}

/**
 * Zoom the map to a barangay.
 * 1) uses `bbox` when it is valid
 * 2) otherwise falls back to the geometry of the barangay tiles currently loaded on the map
 *    (only approximate: tile geometry can be clipped, and the barangay may not be loaded)
 *
 * The final zoom is never lower than MIN_ZOOM, so the barangay layer stays visible.
 */
export function zoomToBarangay(
  map: maplibregl.Map,
  id: number | string,
  rawBbox?: unknown
): void {
  let bounds: maplibregl.LngLatBounds | null = null;
  let via = "bbox";

  const bbox = parseBbox(rawBbox);
  if (bbox) {
    bounds = new maplibregl.LngLatBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
  } else {
    via = "tile-fallback";
    console.warn(
      `${TAG} barangay ${id}: no usable bbox (got ${JSON.stringify(rawBbox)}) -> the zoom only works if its tiles are loaded`
    );
    if (map.getSource(SOURCE_ID)) {
      const feats = map
        .querySourceFeatures(SOURCE_ID, { sourceLayer: SOURCE_LAYER })
        .filter((f) => String(f.id) === String(id) || String(f.properties?.id) === String(id));
      console.log(`${TAG} barangay ${id}: tile fallback found ${feats.length} feature(s)`);
      if (feats.length) {
        const b = new maplibregl.LngLatBounds();
        feats.forEach((f) => extendWithCoords(b, (f.geometry as any).coordinates));
        if (!b.isEmpty()) bounds = b;
      }
    }
  }

  if (!bounds) {
    console.warn(`${TAG} barangay ${id}: could not compute bounds`);
    return;
  }

  // Padding must fit inside the canvas or the camera can't be computed
  const { clientWidth: w, clientHeight: h } = map.getCanvas();
  const padding = Math.max(0, Math.min(40, Math.floor(Math.min(w, h) / 4)));

  const camera = map.cameraForBounds(bounds, { padding, maxZoom: 17 });
  if (!camera) {
    console.warn(`${TAG} barangay ${id}: cameraForBounds failed (map too small for the padding?)`);
    return;
  }

  // cameraForBounds has no minZoom option, so apply the floor to the result
  const zoom = Math.max(camera.zoom ?? MIN_ZOOM, MIN_ZOOM);

  console.log(`${TAG} barangay ${id} via ${via}`, {
    bounds: bounds.toArray(),
    canvas: [w, h],
    padding,
    camera,
    zoom,
  });

  map.stop();
  map.easeTo({ ...camera, zoom, duration: 800 });
}