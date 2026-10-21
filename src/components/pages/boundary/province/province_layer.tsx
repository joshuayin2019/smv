// FILE: src/components/.../province_layer.tsx  (render <ProvinceLayer /> next to <RegionLayer />, no props needed)
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useProvinceStore } from "@/stores/boundary/province_stores";
import { useGlobalStore } from "@/stores/global_stores"; // <- adjust to your path
import { basePath } from "@/lib/config";
import { zoomToProvince } from "@/lib/pages/boundary/province/province_zoom";

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

const SOURCE_ID = "province-bndry";
const FILL_ID = "province-bndry-fill";
const LINE_ID = "province-bndry-line";
const SOURCE_LAYER = "province"; // must match the name in ST_AsMVT(..., 'province', ...)

const SOURCE_MIN_ZOOM = 0;
const SOURCE_MAX_ZOOM = 13; // tiles are reused (overzoomed) above this

// Normal, hover and selected look
const FILL_COLOR = "#5eead4";
const FILL_HOVER_COLOR = "#0d9488";
const FILL_SELECTED_COLOR = "#f59e0b";
const LINE_COLOR = "#0f766e";
const LINE_HOVER_COLOR = "#115e59";
const LINE_SELECTED_COLOR = "#b45309";
const FILL_OPACITY = 0.05;
const FILL_HOVER_OPACITY = 0.35;
const FILL_SELECTED_OPACITY = 0.45;
const LINE_OPACITY = 0.9;

// Hover (color + names) only while zoomed out to this level (zoomed in, the polygon covers the screen)
const HOVER_MAX_ZOOM = 14;

// The SMV layers sit above the boundaries: add the province layers below the first SMV layer
const SMV_BOTTOM_ID = "smv-overview";

const tilesUrl = () =>
  `${window.location.origin}${basePath}/api/pages/boundary/province/tiles/{z}/{x}/{y}`;

// Ask the server for the extent of one province (works even if its tiles are not loaded)
async function fetchProvinceExtent(id: number | string): Promise<unknown> {
  const res = await fetch(`${basePath}/api/pages/boundary/province`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { id: Number(id) }, mode: "provinceextent" }),
  });
  if (!res.ok) throw new Error(`provinceextent failed: HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : json?.message ?? null;
}

/* ---------------- Expression helpers ---------------- */

// true while the mouse is over this feature (set with setFeatureState)
const isHover: Expr = ["boolean", ["feature-state", "hover"], false];
// true while this feature is the selected one (selected wins over hover)
const isSelected: Expr = ["boolean", ["feature-state", "selected"], false];

const fillColor: Expr = [
  "case",
  isSelected,
  FILL_SELECTED_COLOR,
  isHover,
  FILL_HOVER_COLOR,
  FILL_COLOR,
];
const lineColor: Expr = [
  "case",
  isSelected,
  LINE_SELECTED_COLOR,
  isHover,
  LINE_HOVER_COLOR,
  LINE_COLOR,
];
const fillOpacity = (k: number): Expr => [
  "case",
  isSelected,
  FILL_SELECTED_OPACITY * k,
  isHover,
  FILL_HOVER_OPACITY * k,
  FILL_OPACITY * k,
];

/* ---------------- Component ---------------- */

export default function ProvinceLayer() {
  const { activePage } = useGlobalStore();
  const map = useMapStore((s) => s.map);
  const visible = useMapStore((s) => s.boundary.visible && s.boundary.type === "province");
  const hoverable = useMapStore((s) => s.boundary.hoverable);
  const opacity = useMapStore((s) => s.boundary.opacity);
  const selectedId = useProvinceStore((s) => s.selectedId);
  const setSelectedId = useProvinceStore((s) => s.setSelectedId);
  const selectAndZoom = useProvinceStore((s) => s.selectAndZoom);
  const zoomRequest = useProvinceStore((s) => s.zoomRequest);

  // tolerant match: "Province", "province", "boundary/province" ...
  const isProvincePage = String(activePage ?? "").toLowerCase().includes("province");

  // Last zoom request that was already handled. Starts at the request that exists when this
  // component mounts, so a remount does not zoom again.
  const handledZoomN = useRef<number | null>(
    useProvinceStore.getState().zoomRequest?.n ?? null
  );

  // Extents already fetched from the server, by province id (so a second click is instant)
  const extentCache = useRef<Map<string, unknown>>(new Map());

  // 1) Add the source + layers (once per map)
  useEffect(() => {
    if (!map) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: "vector",
      tiles: [tilesUrl()],
      minzoom: SOURCE_MIN_ZOOM,
      maxzoom: SOURCE_MAX_ZOOM,
      promoteId: { [SOURCE_LAYER]: "id" }, // the "id" property becomes the feature id (needed for feature-state)
    });

    const before = map.getLayer(SMV_BOTTOM_ID) ? SMV_BOTTOM_ID : undefined;

    map.addLayer(
      {
        id: FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        "source-layer": SOURCE_LAYER,
        paint: {
          "fill-color": fillColor as any,
          "fill-opacity": fillOpacity(1) as any,
        },
      },
      before
    );

    map.addLayer(
      {
        id: LINE_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": SOURCE_LAYER,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": lineColor as any,
          "line-opacity": LINE_OPACITY,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 1.2, 16, 2],
          "line-dasharray": [2, 2],
        },
      },
      before
    );
  }, [map]);

  // 2) Visibility + opacity (from the layer control)
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(FILL_ID) || !map.getLayer(LINE_ID)) return;

    const v = visible ? "visible" : "none";
    map.setLayoutProperty(FILL_ID, "visibility", v);
    map.setLayoutProperty(LINE_ID, "visibility", v);
    map.setPaintProperty(FILL_ID, "fill-opacity", fillOpacity(opacity) as any);
    map.setPaintProperty(LINE_ID, "line-opacity", LINE_OPACITY * opacity);
  }, [map, visible, opacity]);

  // 3) Hover: highlight the province and show its name (and region) next to the mouse.
  //    Only active while "Hoverable" is checked and this layer is shown; unchecking it (or hiding
  //    the layer) removes the handlers and clears any highlight and name box.
  useEffect(() => {
    if (!map || !hoverable || !visible) return;
    if (!map.getLayer(FILL_ID)) return;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });
    let hoveredId: string | number | null = null;

    const setHover = (id: string | number, on: boolean) => {
      if (!map.getSource(SOURCE_ID)) return;
      map.setFeatureState({ source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id }, { hover: on });
    };

    const clear = () => {
      if (hoveredId !== null) setHover(hoveredId, false);
      hoveredId = null;
      popup.remove();
    };

    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      if (map.getZoom() >= HOVER_MAX_ZOOM) {
        clear();
        return;
      }
      const f = e.features?.[0];
      if (!f || f.id === undefined || f.id === null) {
        clear();
        return;
      }

      // new province under the mouse: highlight it and rebuild the name box (as plain text)
      if (f.id !== hoveredId) {
        if (hoveredId !== null) setHover(hoveredId, false);
        hoveredId = f.id;
        setHover(f.id, true);

        const box = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = String(f.properties?.pro_name ?? "");
        const region = document.createElement("div");
        region.textContent = String(f.properties?.reg_name ?? "");
        region.style.fontSize = "11px";
        region.style.opacity = "0.7";
        box.append(name, region);
        popup.setDOMContent(box);
      }

      popup.setLngLat(e.lngLat);
      if (!popup.isOpen()) popup.addTo(map);
    };

    map.on("mousemove", FILL_ID, onMove);
    map.on("mouseleave", FILL_ID, clear);

    return () => {
      map.off("mousemove", FILL_ID, onMove);
      map.off("mouseleave", FILL_ID, clear);
      try {
        clear();
      } catch {
        // map is already gone
      }
    };
  }, [map, hoverable, visible]);

  // 3b) Click a province on the map -> select it + zoom to it (only while the Province page is active)
  useEffect(() => {
    if (!map || !visible || !isProvincePage) return;
    if (!map.getLayer(FILL_ID)) return;

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.id === undefined || f.id === null) return;
      selectAndZoom(Number(f.id));
    };

    // pointer cursor while hovering a province (same condition as the click)
    const canvas = map.getCanvas();
    const onEnter = () => {
      canvas.style.cursor = "pointer";
    };
    const onLeave = () => {
      canvas.style.cursor = "";
    };

    map.on("click", FILL_ID, onClick);
    map.on("mouseenter", FILL_ID, onEnter);
    map.on("mouseleave", FILL_ID, onLeave);
    return () => {
      map.off("click", FILL_ID, onClick);
      map.off("mouseenter", FILL_ID, onEnter);
      map.off("mouseleave", FILL_ID, onLeave);
      canvas.style.cursor = "";
    };
  }, [map, visible, isProvincePage, selectAndZoom]);

  // 3b2) Zoom requests (from the table row click or the map click): one single code path.
  //      The extent is fetched from the server by id, so it does not depend on loaded tiles.
  useEffect(() => {
    if (!zoomRequest) return;
    if (!map) return; // handledZoomN is not updated, so it runs again once the map is ready
    if (handledZoomN.current === zoomRequest.n) return; // already handled
    handledZoomN.current = zoomRequest.n;

    const { id, n } = zoomRequest;
    const key = String(id);

    const run = async () => {
      let bbox: unknown = extentCache.current.get(key);
      if (bbox === undefined) {
        try {
          bbox = await fetchProvinceExtent(id);
          if (bbox) extentCache.current.set(key, bbox);
        } catch (err) {
          console.warn("[ProvinceLayer] could not load the extent of province", id, err);
          bbox = undefined; // zoomToProvince falls back to the loaded tiles
        }
      }

      // A newer click happened while waiting: let that one zoom instead
      if (useProvinceStore.getState().zoomRequest?.n !== n) return;

      zoomToProvince(map, id, bbox);
    };

    void run();
  }, [map, zoomRequest]);

  // 3c) Reflect selectedId as feature-state "selected" (highlight color)
  useEffect(() => {
    if (!map || selectedId === null || !map.getSource(SOURCE_ID)) return;
    const target = { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id: selectedId };
    map.setFeatureState(target, { selected: true });
    return () => {
      if (map.getSource(SOURCE_ID)) map.setFeatureState(target, { selected: false });
    };
  }, [map, selectedId]);

  // 3d) Clear the selection when leaving the Province page
  useEffect(() => {
    if (!isProvincePage) setSelectedId(null);
  }, [isProvincePage, setSelectedId]);

  // 4) Remove the layers and source when this component unmounts
  useEffect(() => {
    if (!map) return;
    return () => {
      if (!map.getStyle()) return; // map was already removed
      [LINE_ID, FILL_ID].forEach((id) => map.getLayer(id) && map.removeLayer(id));
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}