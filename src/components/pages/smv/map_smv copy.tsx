import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useGlobalStore, type Scope } from "@/stores/global_stores";
import { basePath } from "@/lib/config";

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

const MODE: "stacked" | "parallel" = "stacked";
const MIN_ZOOM = 16;

// Keep the order: the first zonal ends up on top
const ZONALS = [
  { key: "r", label: "Residential", color: "#22c55e" },
  { key: "c", label: "Commercial", color: "#3b82f6" },
  { key: "i", label: "Industrial", color: "#f59e0b" },
  { key: "a", label: "Agricultural", color: "#a855f7" },
];

// [zoom, pixels per step]
const WIDTH_STOPS: [number, number][] = [
  [16, 4],
  [21, 6],
];

const DEFAULT_ENABLED: Record<string, boolean> = Object.fromEntries(
  ZONALS.map((z) => [z.key, true])
);

const SOURCE_ID = "smv";
const layerId = (key: string) => `smv-${key}`;
const SMV_LAYER_IDS = ZONALS.map((z) => layerId(z.key));

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
        minzoom: 8,
        maxzoom: 18,
      });

      // Add from last to first so the first zonal draws on top
      for (let idx = ZONALS.length - 1; idx >= 0; idx--) {
        const z = ZONALS[idx];
        map.addLayer({
          id: layerId(z.key),
          type: "line",
          source: SOURCE_ID,
          "source-layer": "smv", // must match the name in ST_AsMVT
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
           ${esc(p.barangay)}, ${esc(p.city)}<br/>
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
      SMV_LAYER_IDS.forEach((id) => map.getLayer(id) && map.removeLayer(id));
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}