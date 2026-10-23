import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useGlobalStore, type Scope } from "@/stores/global_stores";
import {
  usePopulationStore,
  type PopulationMode,
  type PopulationRecord,
} from "@/stores/demographic/population_stores";
import { basePath } from "@/lib/config";
import { arrangeDemographicLayers } from '@/lib/demographic_layer_order';
import PopulationSexMarkers from './sex_markers_population';

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

export const PAGE_NAME = "Population"; // the layer only shows while this page is active

export const MODES: { key: PopulationMode; label: string }[] = [
  { key: "region", label: "Region" },
  { key: "province", label: "Province" },
  { key: "municipality", label: "Municipality" },
  { key: "barangay", label: "Barangay" },
];

const SOURCE_MIN_ZOOM = 3;
const SOURCE_MAX_ZOOM = 14;

// Zoom where each mode starts to show. The grouped modes (region, province, municipality)
// show at every zoom; barangay has too many polygons for the country view.
export const MODE_MIN_ZOOM: Record<PopulationMode, number> = {
  region: SOURCE_MIN_ZOOM,
  province: SOURCE_MIN_ZOOM,
  municipality: SOURCE_MIN_ZOOM,
  barangay: 8,
};

// Zoom where the labels (population + name) start to show
const LABEL_MIN_ZOOM: Record<PopulationMode, number> = {
  region: 3,
  province: 5,
  municipality: 7,
  barangay: 12,
};

// Tile layer the labels are read from: barangay has no separate label layer (the polygons carry them)
const labelSourceLayer = (mode: PopulationMode) =>
  mode === "barangay" ? "population" : "population_label";

// TODO: must be a font that your basemap's glyphs server has (check the text-font of your basemap labels)
const LABEL_FONT = ["Open Sans Semibold", "Arial Unicode MS Bold"];

const COLORS = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"];

// Lower bound of each color step. The totals are very different per mode, so each mode has its own.
const MODE_BREAKS: Record<PopulationMode, number[]> = {
  region: [0, 1_000_000, 2_000_000, 4_000_000, 8_000_000, 12_000_000],
  province: [0, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000],
  municipality: [0, 25_000, 50_000, 100_000, 250_000, 500_000],
  barangay: [0, 2_000, 5_000, 10_000, 20_000, 40_000],
};

// Exported so the layer control can draw the legend for the current mode
export const popBreaks = (mode: PopulationMode) => {
  const mins = MODE_BREAKS[mode];
  const fmt = (n: number) => n.toLocaleString("en-US");
  return mins.map((min, i) => ({
    min,
    color: COLORS[i],
    label:
      i === 0
        ? `< ${fmt(mins[1])}`
        : i === mins.length - 1
        ? `${fmt(min)}+`
        : `${fmt(min)} - ${fmt(mins[i + 1] - 1)}`,
  }));
};

const SOURCE_ID = "population";
const FILL_ID = "population-fill";
const LINE_ID = "population-line";
const SEL_FILL_ID = "population-sel-fill";
const SEL_LINE_ID = "population-sel-line";
const LABEL_ID = "population-label";
export const POPULATION_LAYER_IDS = [LABEL_ID, SEL_LINE_ID, SEL_FILL_ID, LINE_ID, FILL_ID];

const FILL_OPACITY = 0.6;
const DIM_FACTOR = 0.5; // other areas while one is selected

/* ---------------- Expression helpers ---------------- */

const colorExpr = (mode: PopulationMode): Expr => {
  const mins = MODE_BREAKS[mode];
  return [
    "step",
    ["to-number", ["get", "population"], 0],
    COLORS[0],
    ...mins.slice(1).flatMap((m, i) => [m, COLORS[i + 1]]),
  ] as unknown as Expr;
};

const noneFilter = ["==", ["get", "code"], ""] as unknown as Expr;
const codeFilter = (code: string): Expr =>
  ["==", ["to-string", ["get", "code"]], code] as unknown as Expr;

// Population count on the first line, the area name below it
const labelText: Expr = [
  "format",
  [
    "number-format",
    ["to-number", ["get", "population"], 0],
    { locale: "en-US", "min-fraction-digits": 0, "max-fraction-digits": 0 },
  ],
  { "font-scale": 1 },
  "\n",
  {},
  ["coalesce", ["get", "name"], ""],
  { "font-scale": 0.8 },
] as unknown as Expr;

const labelSize: Expr = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3, 10,
  8, 12,
  12, 14,
] as unknown as Expr;

const tilesUrl = (scope: Scope[], mode: PopulationMode) =>
  `${window.location.origin}${basePath}/api/pages/demographic/population/tiles/{z}/{x}/{y}?level=${mode}&scope=${encodeURIComponent(
    JSON.stringify(scope)
  )}`;

// Removes every population layer and the source (top layer first)
function removeAll(map: maplibregl.Map) {
  if (!map.getStyle()) return; // map was already removed
  POPULATION_LAYER_IDS.forEach((id) => map.getLayer(id) && map.removeLayer(id));
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/* ---------------- Component ---------------- */

type Props = {
  visible?: boolean;
  opacity?: number;
};

export default function PopulationLayer({ visible = true, opacity = 1 }: Props) {
  const map = useMapStore((s) => s.map);
  const scopePsa = useGlobalStore((s) => s.auth?.scope_psa);
  const scopeKey = JSON.stringify(scopePsa ?? null);
  const activePage = useGlobalStore((s) => s.activePage);

  const mode = usePopulationStore((s) => s.populationMode);
  const selectedCode = usePopulationStore((s) => s.selectedPopulation?.code ?? null);
  const selectedLevel = usePopulationStore((s) => s.selectedPopulation?.level ?? null);

  // Shown only on the Population page (and when the visible prop is on)
  const show = visible && activePage === PAGE_NAME;

  // Fit the user's complete coverage each time the Population page is opened.
  useEffect(() => {
    if (!map || activePage !== PAGE_NAME || !scopePsa?.length) return;
    const ctrl = new AbortController();
    const sp = new URLSearchParams({ scope: scopeKey });
    fetch(`${basePath}/api/pages/demographic/population/extent?${sp}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Population extent failed (${res.status})`);
        return res.json() as Promise<number[] | null>;
      })
      .then((bbox) => {
        if (ctrl.signal.aborted || !bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return;
        if (usePopulationStore.getState().selectedPopulation) return;
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: 60,
          maxZoom: 14,
          duration: 900,
        });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.warn("Population extent:", error);
      });
    return () => { ctrl.abort(); };
  }, [map, activePage, scopeKey]);

  // Table and map clicks share the same selection, so both fit the full area boundary.
  useEffect(() => {
    if (!map || !show || !selectedCode || selectedLevel !== mode || !scopePsa?.length) return;
    const ctrl = new AbortController();
    const sp = new URLSearchParams({ scope: scopeKey, level: mode, code: selectedCode });
    fetch(`${basePath}/api/pages/demographic/population/extent?${sp}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Population extent failed (${res.status})`);
        return res.json() as Promise<number[] | null>;
      })
      .then((bbox) => {
        if (ctrl.signal.aborted || !bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return;
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: 60,
          maxZoom: 16,
          duration: 900,
        });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.warn("Population selection extent:", error);
      });
    return () => { ctrl.abort(); };
  }, [map, show, mode, selectedCode, selectedLevel, scopeKey]);

  // 1) Build the source + layers for the current mode and scope from scratch.
  //    A new mode or scope removes everything (cleanup) and builds it again, so no old tiles stay around.
  useEffect(() => {
    if (!map || !scopePsa) return;

    removeAll(map);

    map.addSource(SOURCE_ID, {
      type: "vector",
      tiles: [tilesUrl(scopePsa, mode)],
      minzoom: SOURCE_MIN_ZOOM,
      maxzoom: SOURCE_MAX_ZOOM,
    });

    map.addLayer({
      id: FILL_ID,
      type: "fill",
      source: SOURCE_ID,
      "source-layer": "population", // must match the name in ST_AsMVT
      minzoom: MODE_MIN_ZOOM[mode],
      layout: { visibility: "none" }, // effect 2 shows it on the Population page
      paint: { "fill-color": colorExpr(mode) as any, "fill-opacity": FILL_OPACITY },
    });

    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "population",
      minzoom: MODE_MIN_ZOOM[mode],
      layout: { "line-join": "round", visibility: "none" },
      paint: { "line-color": "#334155", "line-width": 0.6, "line-opacity": 0.7 },
    });

    // Selected area: stronger fill + thick outline (filter is set in effect 4)
    map.addLayer({
      id: SEL_FILL_ID,
      type: "fill",
      source: SOURCE_ID,
      "source-layer": "population",
      filter: noneFilter as any,
      layout: { visibility: "none" },
      paint: { "fill-color": colorExpr(mode) as any, "fill-opacity": 0.9 },
    });

    map.addLayer({
      id: SEL_LINE_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "population",
      filter: noneFilter as any,
      layout: { "line-join": "round", visibility: "none" },
      paint: { "line-color": "#ff2d55", "line-width": 3 },
    });

    // Labels: population count, the area name below it.
    // Region / province / municipality: one point per area from "population_label" (no duplicates).
    // Barangay: from the polygons, as before.
    // In a try/catch so a label or font problem can never break the rest of the layer.
    try {
      map.addLayer({
        id: LABEL_ID,
        type: "symbol",
        source: SOURCE_ID,
        "source-layer": labelSourceLayer(mode),
        minzoom: LABEL_MIN_ZOOM[mode],
        layout: {
          visibility: "none",
          "text-field": labelText as any,
          "text-font": LABEL_FONT,
          "text-size": labelSize as any,
          "text-anchor": "center",
          "text-justify": "center",
          "text-max-width": 8,
          // bigger populations win when labels collide
          "symbol-sort-key": ["-", ["to-number", ["get", "population"], 0]] as any,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
    } catch (err) {
      console.warn("population label layer failed:", err);
    }

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (useGlobalStore.getState().activePage !== PAGE_NAME) return; // other pages: ignore
      const canPick = map.getLayer(FILL_ID) && map.getLayoutProperty(FILL_ID, "visibility") !== "none";
      const f = canPick ? map.queryRenderedFeatures(e.point, { layers: [FILL_ID] })[0] : undefined;
      if (!f) {
        usePopulationStore.getState().setSelectedPopulation(null);
        return;
      }
      usePopulationStore.getState().setSelectedPopulation({
        ...(f.properties as unknown as PopulationRecord),
        level: usePopulationStore.getState().populationMode,
      });
    };

    let pointing = false;
    let raf = 0;
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (raf) return;
      const point = e.point;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const hit =
          useGlobalStore.getState().activePage === PAGE_NAME &&
          map.getLayer(FILL_ID) !== undefined &&
          map.getZoom() >= MODE_MIN_ZOOM[usePopulationStore.getState().populationMode] &&
          map.queryRenderedFeatures(point, { layers: [FILL_ID] }).length > 0;
        if (hit) {
          map.getCanvas().style.cursor = "pointer";
          pointing = true;
        } else if (pointing) {
          map.getCanvas().style.cursor = "";
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
        removeAll(map); // also covers unmount
      } catch {
        // canvas is gone together with the map
      }
    };
  }, [map, scopeKey, mode]);

  // 1b) A new mode or leaving the Population page: clear the selection
  useEffect(() => {
    usePopulationStore.getState().setSelectedPopulation(null);
  }, [mode]);

  useEffect(() => {
    if (activePage !== PAGE_NAME) usePopulationStore.getState().setSelectedPopulation(null);
  }, [activePage]);

  // 2) Visibility + opacity (dim the rest while one area is selected).
  //    "mode" is a dependency because effect 1 rebuilds the layers hidden.
  useEffect(() => {
    if (!map || !scopePsa) return;
    const base = selectedCode !== null ? opacity * DIM_FACTOR : opacity;

    [FILL_ID, LINE_ID, LABEL_ID].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    });
    if (map.getLayer(FILL_ID)) map.setPaintProperty(FILL_ID, "fill-opacity", FILL_OPACITY * base);
    if (map.getLayer(LINE_ID)) map.setPaintProperty(LINE_ID, "line-opacity", 0.7 * opacity);
    if (map.getLayer(LABEL_ID)) map.setPaintProperty(LABEL_ID, "text-opacity", opacity);
  }, [map, scopeKey, mode, show, opacity, selectedCode]);

  // 4) Highlight the selected area
  useEffect(() => {
    if (!map || !scopePsa) return;
    const on = show && selectedCode !== null;
    const filter = (selectedCode === null ? noneFilter : codeFilter(String(selectedCode))) as any;

    [SEL_FILL_ID, SEL_LINE_ID].forEach((id) => {
      if (!map.getLayer(id)) return;
      map.setFilter(id, filter);
      map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    });
  }, [map, scopeKey, mode, show, selectedCode]);

  // 5) Keep the population layers above the basemap but below the SMV and POI layers
  useEffect(() => {
    if (!map || !scopePsa) return;

    const place = () => {
      if (!map.getLayer(FILL_ID)) return;
      arrangeDemographicLayers(map);
    };

    place();
    map.on("styledata", place);
    map.on("idle", place);
    return () => {
      map.off("styledata", place);
      map.off("idle", place);
    };
  }, [map, scopeKey]);

  return <PopulationSexMarkers visible={visible} opacity={opacity} />;
}
