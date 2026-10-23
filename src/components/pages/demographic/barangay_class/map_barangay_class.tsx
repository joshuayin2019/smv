import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useGlobalStore, type Scope } from "@/stores/global_stores";
import {
  useBarangayClassStore,
  type BarangayClassMode,
  type BarangayClassRecord,
} from "@/stores/demographic/barangay_class_stores";
import { basePath } from "@/lib/config";
import { arrangeDemographicLayers } from '@/lib/demographic_layer_order';
import HoverBarangayClass from './hover_barangay_class';

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

export const PAGE_NAME = "Barangay Class"; // the layer only shows while this page is active

export const MODES: { key: BarangayClassMode; label: string }[] = [
  { key: "barangay", label: "Barangay" },
];

const SOURCE_MIN_ZOOM = 3;
const SOURCE_MAX_ZOOM = 14;

// Zoom where each mode starts to show. The grouped modes (region, province, municipality)
// show at every zoom; barangay has too many polygons for the country view.
export const MODE_MIN_ZOOM: Record<BarangayClassMode, number> = {
  barangay: 8,
};

// Zoom where the labels (barangay_class + name) start to show
const LABEL_MIN_ZOOM: Record<BarangayClassMode, number> = {
  barangay: 12,
};

// Tile layer the labels are read from: barangay has no separate label layer (the polygons carry them)
const labelSourceLayer = (mode: BarangayClassMode) =>
  mode === "barangay" ? "barangay_class" : "barangay_class_label";

// TODO: must be a font that your basemap's glyphs server has (check the text-font of your basemap labels)
const LABEL_FONT = ["Open Sans Semibold", "Arial Unicode MS Bold"];

const SOURCE_ID = "barangay_class";
const FILL_ID = "barangay_class-fill";
const LINE_ID = "barangay_class-line";
const HALO_ID = "barangay_class-boundary-halo";
const HOVER_ID = "barangay_class-hover-fill";
const SEL_FILL_ID = "barangay_class-sel-fill";
const SEL_LINE_ID = "barangay_class-sel-line";
const LABEL_ID = "barangay_class-label";
export const POPULATION_LAYER_IDS = [LABEL_ID, SEL_LINE_ID, SEL_FILL_ID, LINE_ID, HALO_ID, HOVER_ID, FILL_ID];

const FILL_OPACITY = 0.55;
const DIM_FACTOR = 0.5; // other areas while one is selected

/* ---------------- Expression helpers ---------------- */

const noneFilter = ["==", ["get", "code"], ""] as unknown as Expr;
const codeFilter = (code: string): Expr =>
  ["==", ["to-string", ["get", "code"]], code] as unknown as Expr;

// BarangayClass count on the first line, the area name below it
const labelText: Expr = ['coalesce', ['get', 'name'], ''];

const labelSize: Expr = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3, 10,
  8, 12,
  12, 14,
] as unknown as Expr;

const tilesUrl = (scope: Scope[], mode: BarangayClassMode) =>
  `${window.location.origin}${basePath}/api/pages/demographic/barangay_class/tiles/{z}/{x}/{y}?level=${mode}&scope=${encodeURIComponent(
    JSON.stringify(scope)
  )}`;

// Removes every barangay_class layer and the source (top layer first)
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

export default function BarangayClassLayer({ visible = true, opacity = 1 }: Props) {
  const map = useMapStore((s) => s.map);
  const scopePsa = useGlobalStore((s) => s.auth?.scope_psa);
  const scopeKey = JSON.stringify(scopePsa ?? null);
  const activePage = useGlobalStore((s) => s.activePage);

  const mode = useBarangayClassStore((s) => s.barangay_classMode);
  const selectedCode = useBarangayClassStore((s) => s.selectedBarangayClass?.code ?? null);
  const selectedLevel = useBarangayClassStore((s) => s.selectedBarangayClass?.level ?? null);

  // Shown only on the BarangayClass page (and when the visible prop is on)
  const show = visible && activePage === PAGE_NAME;

  // Fit the user's complete coverage each time the BarangayClass page is opened.
  useEffect(() => {
    if (!map || activePage !== PAGE_NAME || !scopePsa?.length) return;
    const ctrl = new AbortController();
    const sp = new URLSearchParams({ scope: scopeKey });
    fetch(`${basePath}/api/pages/demographic/barangay_class/extent?${sp}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`BarangayClass extent failed (${res.status})`);
        return res.json() as Promise<number[] | null>;
      })
      .then((bbox) => {
        if (ctrl.signal.aborted || !bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return;
        if (useBarangayClassStore.getState().selectedBarangayClass) return;
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: 60,
          maxZoom: 14,
          duration: 900,
        });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.warn("BarangayClass extent:", error);
      });
    return () => { ctrl.abort(); };
  }, [map, activePage, scopeKey]);

  // Table and map clicks share the same selection, so both fit the full area boundary.
  useEffect(() => {
    if (!map || !show || !selectedCode || selectedLevel !== mode || !scopePsa?.length) return;
    const ctrl = new AbortController();
    const sp = new URLSearchParams({ scope: scopeKey, level: mode, code: selectedCode });
    fetch(`${basePath}/api/pages/demographic/barangay_class/extent?${sp}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`BarangayClass extent failed (${res.status})`);
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
        if (error.name !== "AbortError") console.warn("BarangayClass selection extent:", error);
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
      "source-layer": "barangay_class", // must match the name in ST_AsMVT
      minzoom: MODE_MIN_ZOOM[mode],
      layout: { visibility: "none" }, // effect 2 shows it on the BarangayClass page
      paint: { "fill-color": ['match', ['get', 'urban_rural'], 'U', '#c000db', 'R', '#00c98b', '#94a3b8'], "fill-opacity": FILL_OPACITY },
    });

    map.addLayer({
      id: HOVER_ID,
      type: "fill",
      source: SOURCE_ID,
      "source-layer": "barangay_class",
      minzoom: MODE_MIN_ZOOM[mode],
      filter: noneFilter,
      layout: { visibility: "none" },
      paint: { "fill-color": "#2585e6", "fill-opacity": 0.24 },
    });

    map.addLayer({
      id: HALO_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "barangay_class",
      minzoom: MODE_MIN_ZOOM[mode],
      layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 12, 5, 16, 6],
        "line-opacity": 0.95,
      },
    });

    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "barangay_class",
      minzoom: MODE_MIN_ZOOM[mode],
      layout: { "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#163f78",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 12, 2.5, 16, 3.5],
        "line-opacity": 1,
      },
    });

    // Selected area: stronger fill + thick outline (filter is set in effect 4)
    map.addLayer({
      id: SEL_FILL_ID,
      type: "fill",
      source: SOURCE_ID,
      "source-layer": "barangay_class",
      filter: noneFilter as any,
      layout: { visibility: "none" },
      paint: { "fill-color": "#238ac2", "fill-opacity": 0.12 },
    });

    map.addLayer({
      id: SEL_LINE_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "barangay_class",
      filter: noneFilter as any,
      layout: { "line-join": "round", visibility: "none" },
      paint: { "line-color": "#ff2d55", "line-width": 4 },
    });

    // Labels: barangay_class count, the area name below it.
    // Region / province / municipality: one point per area from "barangay_class_label" (no duplicates).
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
          // bigger barangay_classs win when labels collide
          "symbol-sort-key": ["-", ["to-number", ["get", "barangay_class"], 0]] as any,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
    } catch (err) {
      console.warn("barangay_class label layer failed:", err);
    }

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (useGlobalStore.getState().activePage !== PAGE_NAME) return; // other pages: ignore
      if (!map.getLayer(FILL_ID) || map.getLayoutProperty(FILL_ID, "visibility") === "none") return;
      const f = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] })[0];
      if (!f) {
        useBarangayClassStore.getState().setSelectedBarangayClass(null);
        return;
      }
      useBarangayClassStore.getState().setSelectedBarangayClass({
        ...(f.properties as unknown as BarangayClassRecord),
        level: useBarangayClassStore.getState().barangay_classMode,
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
          map.getZoom() >= MODE_MIN_ZOOM[useBarangayClassStore.getState().barangay_classMode] &&
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

  // 1b) A new mode or leaving the BarangayClass page: clear the selection
  useEffect(() => {
    useBarangayClassStore.getState().setSelectedBarangayClass(null);
  }, [mode]);

  useEffect(() => {
    if (activePage !== PAGE_NAME) useBarangayClassStore.getState().setSelectedBarangayClass(null);
  }, [activePage]);

  // 2) Visibility + opacity (dim the rest while one area is selected).
  //    "mode" is a dependency because effect 1 rebuilds the layers hidden.
  useEffect(() => {
    if (!map || !scopePsa) return;
    const base = selectedCode !== null ? opacity * DIM_FACTOR : opacity;

    [FILL_ID, HOVER_ID, HALO_ID, LINE_ID, LABEL_ID].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    });
    if (map.getLayer(FILL_ID)) map.setPaintProperty(FILL_ID, "fill-opacity", FILL_OPACITY * base);
    if (map.getLayer(HOVER_ID)) map.setPaintProperty(HOVER_ID, "fill-opacity", 0.24 * opacity);
    if (map.getLayer(HALO_ID)) map.setPaintProperty(HALO_ID, "line-opacity", 0.95 * opacity);
    if (map.getLayer(LINE_ID)) map.setPaintProperty(LINE_ID, "line-opacity", opacity);
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

  // 5) Keep the barangay_class layers above the basemap but below the SMV and POI layers
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

  return <HoverBarangayClass visible={visible} />;
}
