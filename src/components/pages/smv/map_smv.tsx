import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useGlobalStore, type Scope } from "@/stores/global_stores";
import { basePath } from "@/lib/config";

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
  `${window.location.origin}${basePath}/api/pages/smv/tile/{z}/{x}/{y}?scope=${encodeURIComponent(
    JSON.stringify(scope)
  )}`;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

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
    }

    // Popup + pointer only on the multicolor layers (they carry the full attributes)
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: SMV_LAYER_IDS })[0];
      if (!f) return;
      const p = f.properties ?? {};

      const rows = ZONALS.filter((z) => Number(p[z.key]) > 0)
        .map(
          (z) =>
            `<div><span style="display:inline-block;width:10px;height:10px;background:${z.color};margin-right:6px;border-radius:2px"></span>${esc(z.label)}: ${Number(p[z.key]).toLocaleString()}</div>`
        )
        .join("");

      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${esc(p.street ?? "(no street name)")}</strong><br/>
           ${esc(p.bgy_name)}, ${esc(p.mun_name)}, ${esc(p.pro_name)}<br/>
           Class: ${esc(p.fclass ?? "-")} &middot; SMV year: ${esc(p.smv_year ?? "-")}
           <div style="margin-top:6px">${rows || "No zonal values"}</div>`
        )
        .addTo(map);
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: SMV_LAYER_IDS });
      map.getCanvas().style.cursor = hit.length ? "pointer" : "";
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
    };
  }, [map, scopeKey]);




  // 2) Apply visibility, opacity and per-zonal toggles
  useEffect(() => {
    if (!map || !scopeSmv) return;

    // Overview layer
    if (map.getLayer(LOW_ID)) {
      const anyOn = ZONALS.some((z) => enabled[z.key]);
      map.setLayoutProperty(LOW_ID, "visibility", visible && anyOn ? "visible" : "none");
      map.setFilter(LOW_ID, lowFilter(enabled) as any);
      map.setPaintProperty(LOW_ID, "line-opacity", opacity);
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
      map.setPaintProperty(id, "line-opacity", opacity);
    });
  }, [map, scopeKey, visible, opacity, enabled]);

  // 3) Remove the layers and source when this component unmounts
  useEffect(() => {
    if (!map) return;
    return () => {
      if (!map.getStyle()) return; // map was already removed
      [LOW_ID, ...SMV_LAYER_IDS].forEach((id) => map.getLayer(id) && map.removeLayer(id));
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);


  // 4) Keep the SMV layers above the basemap but below the POI layers
    useEffect(() => {
      if (!map || !scopeSmv) return;

      // bottom -> top; the first zonal ends up on top of the SMV layers
      const order = [LOW_ID, ...[...SMV_LAYER_IDS].reverse()];
      const POI_BOTTOM = "poi-group-all"; // lowest POI layer (added by PoiLayer)

      const place = () => {
        const style = map.getStyle();
        if (!style) return; // map was already removed
        const ids = style.layers.map((l) => l.id);
        if (!ids.includes(SMV_LAYER_IDS[0])) return; // SMV layers not added yet

        const before = ids.includes(POI_BOTTOM) ? POI_BOTTOM : undefined;

        // already in place -> stop, so moveLayer doesn't re-trigger the events forever
        const topSmv = ids.indexOf(SMV_LAYER_IDS[0]);
        if (before ? topSmv + 1 === ids.indexOf(before) : topSmv === ids.length - 1) return;

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

  return null;
}
