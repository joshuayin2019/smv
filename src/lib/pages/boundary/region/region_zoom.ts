// src/lib/region_zoom.ts
import * as maplibregl from "maplibre-gl";

const SOURCE_ID = "region-bndry";
const SOURCE_LAYER = "region";
const TAG = "[zoomToRegion]";

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

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/**
 * Accepts:
 *  - [a,b,c,d]
 *  - "{a,b,c,d}", "a,b,c,d"
 *  - "BOX(minx miny,maxx maxy)" / "BOX3D(minx miny minz,maxx maxy maxz)"  (PostGIS ST_Extent)
 *  - a JSON string of any of the above
 *  - { xmin, ymin, xmax, ymax } / { minX, minY, maxX, maxY } / { minLng, minLat, maxLng, maxLat }
 *    / { west, south, east, north }
 * Returns [minLng, minLat, maxLng, maxLat] or null when it can't be understood.
 */
function parseBbox(raw: unknown): [number, number, number, number] | null {
  let arr: unknown[] | null = null;

  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[") || (s.startsWith("{") && s.includes(":"))) {
      try {
        return parseBbox(JSON.parse(s));
      } catch {
        // not JSON -> fall through to number extraction
      }
    }
    const nums = s.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
    if (nums?.length === 4) arr = nums;
    else if (nums?.length === 6) arr = [nums[0], nums[1], nums[3], nums[4]]; // BOX3D: skip z values
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    arr = [
      pick(o, ["minLng", "minX", "xmin", "west", "min_lng"]),
      pick(o, ["minLat", "minY", "ymin", "south", "min_lat"]),
      pick(o, ["maxLng", "maxX", "xmax", "east", "max_lng"]),
      pick(o, ["maxLat", "maxY", "ymax", "north", "max_lat"]),
    ];
  }

  if (!arr || arr.length !== 4) return null;
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
 * Zoom the map to a region.
 * 1) uses `bbox` when it is valid
 * 2) otherwise falls back to the geometry of the tiles currently loaded on the map
 *    (only approximate: tile geometry can be clipped, and the region may not be loaded,
 *    which is why a missing bbox makes the zoom work only "sometimes")
 */
export function zoomToRegion(
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
      `${TAG} region ${id}: no usable bbox (got ${JSON.stringify(rawBbox)}, typeof ${typeof rawBbox}) -> the zoom only works if this region's tiles are loaded`
    );
    if (map.getSource(SOURCE_ID)) {
      const feats = map
        .querySourceFeatures(SOURCE_ID, { sourceLayer: SOURCE_LAYER })
        .filter((f) => String(f.id) === String(id) || String(f.properties?.id) === String(id));
      console.log(`${TAG} region ${id}: tile fallback found ${feats.length} feature(s)`);
      if (feats.length) {
        const b = new maplibregl.LngLatBounds();
        feats.forEach((f) => extendWithCoords(b, (f.geometry as any).coordinates));
        if (!b.isEmpty()) bounds = b;
      }
    }
  }

  if (!bounds) {
    console.warn(`${TAG} region ${id}: could not compute bounds`);
    return;
  }

  // Padding must fit inside the canvas or the camera can't be computed
  const { clientWidth: w, clientHeight: h } = map.getCanvas();
  const padding = Math.max(0, Math.min(40, Math.floor(Math.min(w, h) / 4)));

  const camera = map.cameraForBounds(bounds, { padding, maxZoom: 16 });
  console.log(`${TAG} region ${id} via ${via}`, {
    bounds: bounds.toArray(),
    canvas: [w, h],
    padding,
    camera,
  });
  if (!camera) {
    console.warn(`${TAG} region ${id}: cameraForBounds failed (map too small for the padding?)`);
    return;
  }

  map.stop();
  map.easeTo({ ...camera, duration: 800 });
}