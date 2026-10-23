// FILE: src/components/.../smv_layer.tsx  (replace your SMV map layer file; keep its current location)
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useGlobalStore, type Scope } from "@/stores/global_stores";
import { useSmvStore, type SmvRecord } from "@/stores/smv_stores";
import { basePath } from "@/lib/config";
import SmvDetailsWindow from "./smv_details_window";

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

const MODE: "stacked" | "parallel" = "stacked";

// Multicolor view starts here. Below it, the single-color overview is shown.
export const MIN_ZOOM = 16; // exported so the layer control can tell which mode the map is in
const SOURCE_MIN_ZOOM = 5;
const SOURCE_MAX_ZOOM = 18; // tiles are reused (overzoomed) above this

// Keep the order: the first zonal ends up on top
export const ZONALS = [
  { key: "r", label: "Residential", color: "#22c55e" },
  { key: "c", label: "Commercial", color: "#3b82f6" },
  { key: "i", label: "Industrial", color: "#f59e0b" },
  { key: "a", label: "Agricultural", color: "#a855f7" },
];

// [zoom, pixels per step] for the multicolor view
const WIDTH_STOPS: [number, number][] = [
  [16, 4],
  [21, 6],
];

// Overview (zoom 5 to 15) style
const LOW_COLOR = "#6366f1";

const DEFAULT_ENABLED: Record<string, boolean> = Object.fromEntries(
  ZONALS.map((z) => [z.key, true])
);

// Single source of truth for the overview color (used by the map layer and by the layer control legend):
// exactly one type checked -> that type's color, otherwise the shared overview color
export const overviewColor = (enabled: Record<string, boolean>) => {
  const on = ZONALS.filter((z) => enabled[z.key]);
  return on.length === 1 ? on[0].color : LOW_COLOR;
};

const SOURCE_ID = "smv";
const LOW_ID = "smv-overview";
const layerId = (key: string) => `smv-${key}`;
const SMV_LAYER_IDS = ZONALS.map((z) => layerId(z.key)); // clickable layers

// Selected road highlight: pulsing halo + dark casing + thicker zonal colors on top
const HL_GLOW_ID = "smv-hl-glow";
const HL_GLOW_COLOR = "#ff2d55"; // was white (invisible on a light map)
const HL_CASING_ID = "smv-hl-casing";
const HL_CASING_COLOR = "#0f172a"; // dark outline around the selected road
const hlId = (key: string) => `smv-hl-${key}`;
const HL_IDS = ZONALS.map((z) => hlId(z.key)); // first = topmost
const HL_SCALE = 2.5; // highlight is this much thicker than the normal line
const PULSE_MS = 1600; // one glow cycle
const DIM_FACTOR = 0.3; // other roads' opacity while one is selected

/* ---------------- Expression helpers ---------------- */

const num = (key: string): Expr => ["to-number", ["get", key], 0];
const isActive = (key: string): Expr => [">", num(key), 0];
const activeNum = (key: string): Expr => ["case", isActive(key), 1, 0];
const sum = (exprs: Expr[]): Expr => ["+", 0, ...exprs] as Expr;

const zoomPx = (mult: Expr | number): Expr =>
  [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...WIDTH_STOPS.flatMap(([z, w]) => [z, ["*", mult, w]]),
  ] as unknown as Expr;

function widthFor(idx: number, enabled: Record<string, boolean>): Expr {
  if (MODE === "parallel") return zoomPx(1);
  const upToHere = ZONALS.slice(0, idx + 1)
    .filter((t) => enabled[t.key])
    .map((t) => activeNum(t.key));
  return zoomPx(sum(upToHere));
}

function offsetFor(idx: number, enabled: Record<string, boolean>): Expr | number {
  if (MODE !== "parallel") return 0;
  const before = sum(
    ZONALS.slice(0, idx).filter((t) => enabled[t.key]).map((t) => activeNum(t.key))
  );
  const total = sum(ZONALS.filter((t) => enabled[t.key]).map((t) => activeNum(t.key)));
  const centered: Expr = ["-", before, ["/", ["-", total, 1], 2]];
  return zoomPx(centered);
}

// Highlight widths (always stacked): the first zonal is the thinnest and sits on top
function hlWidthFor(idx: number, enabled: Record<string, boolean>): Expr {
  const upToHere = ZONALS.slice(0, idx + 1)
    .filter((t) => enabled[t.key])
    .map((t) => activeNum(t.key));
  return zoomPx(["*", HL_SCALE, sum(upToHere)] as unknown as Expr);
}

// Wide pulsing halo behind everything
function glowWidth(enabled: Record<string, boolean>): Expr {
  const total = sum(ZONALS.filter((t) => enabled[t.key]).map((t) => activeNum(t.key)));
  return zoomPx(["+", ["*", HL_SCALE, total], 4] as unknown as Expr);
}

// Dark outline, slightly wider than the colored highlight
function casingWidth(enabled: Record<string, boolean>): Expr {
  const total = sum(ZONALS.filter((t) => enabled[t.key]).map((t) => activeNum(t.key)));
  return zoomPx(["+", ["*", HL_SCALE, total], 0.6] as unknown as Expr);
}

/* ---------------- Overview helpers (zoom 5 to 15) ---------------- */

// Bigger roads are drawn thicker
const classFactor: Expr = [
  "match",
  ["get", "fclass"],
  ["motorway", "motorway_link", "trunk", "trunk_link"], 2,
  ["primary", "primary_link"], 1.6,
  ["secondary", "secondary_link"], 1.3,
  ["tertiary", "tertiary_link"], 1.1,
  0.8,
] as unknown as Expr;

const lowWidth: Expr = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5, ["*", classFactor, 0.6],
  10, ["*", classFactor, 1.2],
  MIN_ZOOM, ["*", classFactor, 2.5],
] as unknown as Expr;

// Only roads that have a value in at least one enabled zonal type
const lowFilter = (enabled: Record<string, boolean>): Expr =>
  ["any", ...ZONALS.filter((z) => enabled[z.key]).map((z) => isActive(z.key))] as unknown as Expr;

/* ---------------- Misc helpers ---------------- */

const tilesUrl = (scope: Scope[]) =>
  `${window.location.origin}${basePath}/api/pages/smv/tiles/{z}/{x}/{y}?scope=${encodeURIComponent(
    JSON.stringify(scope)
  )}`;

// Full attributes of one road (street, names, zonal values, bbox...)
const detailUrl = (id: string, scope: Scope[]) =>
  `${window.location.origin}${basePath}/api/pages/smv/${encodeURIComponent(id)}?scope=${encodeURIComponent(
    JSON.stringify(scope)
  )}`;

// Where to fly to when a road is picked.
// Tries: GeoJSON geometry, then bbox [minX, minY, maxX, maxY], then lng/lat fields.
type Target = { center: [number, number]; bounds?: [[number, number], [number, number]] };

const flatten = (c: any): number[][] =>
  Array.isArray(c) && typeof c[0] === "number" ? [c as number[]] : Array.isArray(c) ? c.flatMap(flatten) : [];

const pickNum = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};

// From a GeoJSON geometry (a record's geometry, or the feature returned by a map click)
function geometryTarget(g: any): Target | null {
  const pts = g?.coordinates ? flatten(g.coordinates) : [];
  if (!pts.length) return null;
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return {
    center: pts[Math.floor(pts.length / 2)] as [number, number], // a point ON the road
    bounds: [
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ],
  };
}

function recordTarget(rec: any): Target | null {
  let g = rec?.geometry ?? rec?.geom;
  if (typeof g === "string") {
    try {
      g = JSON.parse(g);
    } catch {
      g = null;
    }
  }
  const gt = geometryTarget(g);
  if (gt) return gt;

  const bb = rec?.bbox;
  if (Array.isArray(bb) && bb.length === 4 && bb.every((n: unknown) => Number.isFinite(Number(n)))) {
    const [x1, y1, x2, y2] = bb.map(Number);
    return { center: [(x1 + x2) / 2, (y1 + y2) / 2], bounds: [[x1, y1], [x2, y2]] };
  }

  const lng = pickNum(rec?.lng, rec?.lon, rec?.longitude, rec?.x);
  const lat = pickNum(rec?.lat, rec?.latitude, rec?.y);
  return lng !== null && lat !== null ? { center: [lng, lat] } : null;
}

/* ---------------- Component ---------------- */

type Props = {
  visible?: boolean;
  opacity?: number;
  enabled?: Record<string, boolean>; // per-zonal toggles: { r, c, i, a }
};

export default function SmvLayer({
  visible = true,
  opacity = 1,
  enabled = DEFAULT_ENABLED,
}: Props) {
  const map = useMapStore((s) => s.map);
  const scopeSmv = useGlobalStore((s) => s.auth?.scope_smv);
  const scopeKey = JSON.stringify(scopeSmv ?? null);

  // The selected road (set by a map click or a table row click); null = nothing selected
  const selectedId = useSmvStore((s) => s.selectedSmv?.id ?? null);
  const selectedSmv = useSmvStore((s) => s.selectedSmv);

  // Set by a map click: the click point + the clicked road's extent (from the tile feature),
  // so effect 7 can zoom to the road right away
  const clickPosRef = useRef<{ lngLat: maplibregl.LngLat; target: Target | null } | null>(null);
  const [clickTick, setClickTick] = useState(0); // re-runs the zoom effect even when the same road is clicked again

  // id of the road the map already zoomed to (so the details arriving later do not zoom again)
  const zoomedRef = useRef<string | null>(null);

  // 1) Add the source + layers, and the click / hover handlers
  useEffect(() => {
    if (!map || !scopeSmv) return;

    const url = tilesUrl(scopeSmv);
    const existing = map.getSource(SOURCE_ID) as maplibregl.VectorTileSource | undefined;

    if (existing) {
      existing.setTiles([url]); // scope changed: reload tiles
    } else {
      map.addSource(SOURCE_ID, {
        type: "vector",
        tiles: [url],
        minzoom: SOURCE_MIN_ZOOM,
        maxzoom: SOURCE_MAX_ZOOM,
      });

      // Overview layer goes first so the multicolor layers draw above it
      map.addLayer({
        id: LOW_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": "smv", // must match the name in ST_AsMVT
        minzoom: SOURCE_MIN_ZOOM,
        maxzoom: MIN_ZOOM, // hidden from MIN_ZOOM up
        filter: lowFilter(DEFAULT_ENABLED) as any,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": overviewColor(DEFAULT_ENABLED),
          "line-opacity": 1,
          "line-width": lowWidth as any,
        },
      });

      // Add from last to first so the first zonal draws on top
      for (let idx = ZONALS.length - 1; idx >= 0; idx--) {
        const z = ZONALS[idx];
        map.addLayer({
          id: layerId(z.key),
          type: "line",
          source: SOURCE_ID,
          "source-layer": "smv",
          minzoom: MIN_ZOOM,
          filter: isActive(z.key) as any,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": z.color,
            "line-opacity": 1,
            "line-width": widthFor(idx, DEFAULT_ENABLED) as any,
            "line-offset": offsetFor(idx, DEFAULT_ENABLED) as any,
          },
        });
      }

      // Highlight layers, above the normal lines. Hidden until a road is selected;
      // their filter (by road id) is set in effect 5.

      // Pulsing halo (bottom of the highlight stack)
      map.addLayer({
        id: HL_GLOW_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": "smv",
        minzoom: SOURCE_MIN_ZOOM,
        filter: ["==", ["to-string", ["get", "id"]], ""] as any,
        layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
        paint: {
          "line-color": HL_GLOW_COLOR,
          "line-opacity": 0.7,
          "line-blur": 4,
          "line-width": glowWidth(DEFAULT_ENABLED) as any,
        },
      });

      // Dark outline between the halo and the colored lines
      map.addLayer({
        id: HL_CASING_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": "smv",
        minzoom: SOURCE_MIN_ZOOM,
        filter: ["==", ["to-string", ["get", "id"]], ""] as any,
        layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
        paint: {
          "line-color": HL_CASING_COLOR,
          "line-opacity": 0.95,
          "line-width": casingWidth(DEFAULT_ENABLED) as any,
        },
      });

      // Thicker zonal colors on top
      for (let idx = ZONALS.length - 1; idx >= 0; idx--) {
        const z = ZONALS[idx];
        map.addLayer({
          id: hlId(z.key),
          type: "line",
          source: SOURCE_ID,
          "source-layer": "smv",
          minzoom: SOURCE_MIN_ZOOM,
          filter: ["==", ["to-string", ["get", "id"]], ""] as any,
          layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
          paint: {
            "line-color": z.color,
            "line-opacity": 1,
            "line-width": hlWidthFor(idx, DEFAULT_ENABLED) as any,
          },
        });
      }
    }

    // Select on click. Only the multicolor layers are clickable.
    // The tile only has id, fclass, r, c, i, a: that is enough to highlight and zoom at once.
    // The full attributes are loaded by effect 8 (it reacts to any selection without a bbox).
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (useSmvStore.getState().pickingCenter) return; // the click is picking the radius center

      const f = map.queryRenderedFeatures(e.point, { layers: SMV_LAYER_IDS })[0];
      if (!f) {
        useSmvStore.getState().setSelectedSmv(null); // clicked empty map: clear the highlight
        return;
      }

      clickPosRef.current = { lngLat: e.lngLat, target: geometryTarget(f.geometry) }; // used by effect 7
      useSmvStore.getState().setSelectedSmv(f.properties as unknown as SmvRecord);
      setClickTick((t) => t + 1);
    };

    // Pointer cursor over a road. Throttled to one query per frame, and skipped below MIN_ZOOM
    // (the clickable layers are not drawn there), so moving the mouse does not slow the map down.
    let pointing = false; // true while this layer set the pointer cursor
    let raf = 0;

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (useSmvStore.getState().pickingCenter) return; // keep the crosshair while picking
      if (raf) return;
      const point = e.point;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const hit =
          map.getZoom() >= MIN_ZOOM &&
          map.queryRenderedFeatures(point, { layers: SMV_LAYER_IDS }).length > 0;
        if (hit) {
          map.getCanvas().style.cursor = "pointer";
          pointing = true;
        } else if (pointing) {
          map.getCanvas().style.cursor = ""; // only undo what this layer set
          pointing = false;
        }
      });
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      cancelAnimationFrame(raf);
      try {
        if (pointing) map.getCanvas().style.cursor = "";
      } catch {
        // canvas is gone together with the map
      }
    };
  }, [map, scopeKey]);

  // 2) Apply visibility, opacity and per-zonal toggles.
  //    While a road is selected, the other roads are dimmed so the selection stands out.
  useEffect(() => {
    if (!map || !scopeSmv) return;

    const baseOpacity = selectedId !== null ? opacity * DIM_FACTOR : opacity;

    // Overview layer
    if (map.getLayer(LOW_ID)) {
      const anyOn = ZONALS.some((z) => enabled[z.key]);
      map.setLayoutProperty(LOW_ID, "visibility", visible && anyOn ? "visible" : "none");
      map.setFilter(LOW_ID, lowFilter(enabled) as any);
      map.setPaintProperty(LOW_ID, "line-opacity", baseOpacity);
      map.setPaintProperty(LOW_ID, "line-color", overviewColor(enabled)); // follows the checked types
    }

    // Multicolor layers
    ZONALS.forEach((z, idx) => {
      const id = layerId(z.key);
      if (!map.getLayer(id)) return;

      const on = visible && enabled[z.key];
      map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      if (!on) return;

      map.setPaintProperty(id, "line-width", widthFor(idx, enabled) as any);
      map.setPaintProperty(id, "line-offset", offsetFor(idx, enabled) as any);
      map.setPaintProperty(id, "line-opacity", baseOpacity);
    });
  }, [map, scopeKey, visible, opacity, enabled, selectedId]);

  // 3) Remove the layers and source when this component unmounts
  useEffect(() => {
    if (!map) return;
    return () => {
      if (!map.getStyle()) return; // map was already removed
      [HL_GLOW_ID, HL_CASING_ID, ...HL_IDS, LOW_ID, ...SMV_LAYER_IDS].forEach(
        (id) => map.getLayer(id) && map.removeLayer(id)
      );
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  // 4) Keep the SMV layers above the basemap but below ALL POI layers
  useEffect(() => {
    if (!map || !scopeSmv) return;

    // bottom -> top; the highlight sits above the normal lines, the first zonal on top of each group
    const order = [
      LOW_ID,
      ...[...SMV_LAYER_IDS].reverse(),
      HL_GLOW_ID,
      HL_CASING_ID,
      ...[...HL_IDS].reverse(),
    ];
    const TOP_ID = HL_IDS[0]; // topmost SMV layer
    let lastLayerOrder = '';

    const place = () => {
      if (!map.getLayer(TOP_ID)) return;
      const layerOrder = map.getLayersOrder().join('\n');
      if (layerOrder === lastLayerOrder) return;
      lastLayerOrder = layerOrder;
      const style = map.getStyle();
      if (!style) return; // map was already removed
      const ids = style.layers.map((l) => l.id);
      if (!ids.includes(TOP_ID)) return; // SMV layers not added yet

      // The POI layers are recognised by their source: the vector source that loads the POI tiles.
      // (The basemap has its own layers called "poi_...", so the layer id alone is not safe.)
      const poiSources = new Set(
        Object.entries(style.sources)
          .filter(
            ([, s]) =>
              s.type === "vector" &&
              (s as maplibregl.VectorSourceSpecification).tiles?.some((t) =>
                t.includes("/api/pages/poi/tiles")
              )
          )
          .map(([id]) => id)
      );

      // style.layers is ordered bottom -> top, so the first match is the lowest POI layer.
      // The id check is a fallback for a POI layer added before its source shows up here.
      const lowestPoi = style.layers.find(
        (l) =>
          poiSources.has((l as { source?: string }).source ?? "") || l.id.startsWith("poi-")
      );
      const before = lowestPoi?.id;

      // already in place -> stop, so moveLayer doesn't re-trigger the events forever
      const top = ids.indexOf(TOP_ID);
      if (before ? top + 1 === ids.indexOf(before) : top === ids.length - 1) return;

      order.forEach((id) => map.getLayer(id) && map.moveLayer(id, before));
    };

    place();
    map.on("styledata", place);
    map.on("idle", place); // fires after every render, so it also catches layers added later by PoiLayer

    return () => {
      map.off("styledata", place);
      map.off("idle", place);
    };
  }, [map, scopeKey]);

  // 5) Show the selected road: filter the highlight layers by its id
  useEffect(() => {
    if (!map || !scopeSmv) return;

    const sel = selectedId === null ? null : String(selectedId);
    // compared as text, so it works whether the tile stores the id as a number or a string
    const idMatch = ["==", ["to-string", ["get", "id"]], sel ?? ""] as unknown as Expr;

    const setVisible_ = (id: string, on: boolean) =>
      map.setLayoutProperty(id, "visibility", on ? "visible" : "none");

    const anyOn = ZONALS.some((z) => enabled[z.key]);

    if (map.getLayer(HL_GLOW_ID)) {
      map.setFilter(HL_GLOW_ID, idMatch as any);
      map.setPaintProperty(HL_GLOW_ID, "line-width", glowWidth(enabled) as any);
      setVisible_(HL_GLOW_ID, visible && sel !== null && anyOn);
    }

    if (map.getLayer(HL_CASING_ID)) {
      map.setFilter(HL_CASING_ID, idMatch as any);
      map.setPaintProperty(HL_CASING_ID, "line-width", casingWidth(enabled) as any);
      setVisible_(HL_CASING_ID, visible && sel !== null && anyOn);
    }

    ZONALS.forEach((z, idx) => {
      const id = hlId(z.key);
      if (!map.getLayer(id)) return;
      map.setFilter(id, ["all", idMatch, isActive(z.key)] as any);
      map.setPaintProperty(id, "line-width", hlWidthFor(idx, enabled) as any);
      setVisible_(id, visible && sel !== null && !!enabled[z.key]);
    });
  }, [map, scopeKey, visible, enabled, selectedId]);

  // 6) Pulse: the red halo fades and blurs in and out
  useEffect(() => {
    if (!map || selectedId === null || !visible || !ZONALS.some(z => enabled[z.key])) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = ((now - start) % PULSE_MS) / PULSE_MS; // 0 -> 1, then starts over
      const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * t); // smooth 0 -> 1 -> 0
      try {
        if (map.getLayer(HL_GLOW_ID)) {
          map.setPaintProperty(HL_GLOW_ID, "line-opacity", 0.25 + 0.7 * k);
          map.setPaintProperty(HL_GLOW_ID, "line-blur", 2 + 6 * k);
        }
      } catch {
        // style not ready or map removed: the next frame (or the cleanup) handles it
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [map, selectedId, visible, enabled]);

  // 7) Zoom to the selected road, once per selection, for BOTH sources of selection.
  //    - map click: zooms right away from the clicked tile feature
  //    - table row click: there is no geometry yet, so it waits until effect 8 brings the bbox
  //    The details arriving after a map click do NOT zoom a second time.
  useEffect(() => {
    if (!map || !scopeSmv || !selectedSmv) {
      clickPosRef.current = null;
      zoomedRef.current = null;
      return;
    }

    const id = String(selectedSmv.id);
    const click = clickPosRef.current;

    // Best extent we have: the record's own location, else the clicked tile feature
    const t = recordTarget(selectedSmv) ?? click?.target ?? null;
    if (!t) return; // table click: wait for the bbox
    if (zoomedRef.current === id && !click) return; // details arrived after we already zoomed

    clickPosRef.current = null;
    zoomedRef.current = id;

    // fit the whole road, never zoom out below the multicolor zoom
    const cam = t.bounds ? map.cameraForBounds(t.bounds, { padding: 120, maxZoom: 19 }) : undefined;
    map.easeTo({
      center: cam?.center ?? t.center,
      zoom: Math.max(cam?.zoom ?? MIN_ZOOM + 1, MIN_ZOOM + 0.5),
      duration: 800,
    });
  }, [map, scopeKey, selectedSmv, clickTick]);

  // 8) Load the full attributes of the selected road when the selection does not have them yet
  //    (a map click only has the light tile properties, a table row has no bbox).
  //    The full record has a bbox, so this runs once per selected road.
  useEffect(() => {
    if (!scopeSmv || selectedId === null) return;
    if (useSmvStore.getState().selectedSmv?.bbox) return; // already the full record

    const ctrl = new AbortController();
    fetch(detailUrl(String(selectedId), scopeSmv), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const cur = useSmvStore.getState().selectedSmv;
        if (!res?.data || String(cur?.id) !== String(selectedId)) return; // stale or failed
        useSmvStore.getState().setSelectedSmv(res.data as SmvRecord);
      })
      .catch(() => {
        // aborted or failed: the selection stays as it is
      });

    return () => ctrl.abort(); // a new selection cancels the old request
  }, [selectedId, scopeKey]);

  // the details window floats above the map (rendered in a portal), so it can live here
  //return <SmvDetailsWindow zonals={ZONALS} />;
  return <SmvDetailsWindow zonals={ZONALS} />;
}
