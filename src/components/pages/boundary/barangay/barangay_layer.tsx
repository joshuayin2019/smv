import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { basePath } from "@/lib/config";

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

const SOURCE_ID = "barangay-bndry";
const FILL_ID = "barangay-bndry-fill";
const LINE_ID = "barangay-bndry-line";
const LABEL_ID = "barangay-bndry-label"; // names (MapLibre hides the ones that collide)
const SOURCE_LAYER = "barangay"; // must match the name in ST_AsMVT(..., 'barangay', ...)

// Barangays are shown from this zoom (a tile holds too many polygons below it).
// Keep the hint text in layer_control.tsx in sync.
const MIN_ZOOM = 14;
const SOURCE_MIN_ZOOM = MIN_ZOOM;
const SOURCE_MAX_ZOOM = 14; // tiles are reused (overzoomed) above this

// Names are drawn from this zoom (below it the polygons are too small for text)
const LABEL_MIN_ZOOM = 14;

// Normal and hover look
const FILL_COLOR = "#f9a8d4";
const FILL_HOVER_COLOR = "#db2777";
const LINE_COLOR = "#be185d";
const LINE_HOVER_COLOR = "#9d174d";
const FILL_OPACITY = 0.05;
const FILL_HOVER_OPACITY = 0.35;
const LINE_OPACITY = 0.9;

// Label look (fonts must exist in the basemap glyphs; these are the OpenFreeMap ones)
const LABEL_FONT = ["Noto Sans Regular"];
const LABEL_COLOR = "#831843";
const LABEL_HALO = "#ffffff";

// Hover (color + names) only while zoomed out to this level (zoomed in, the polygon covers the screen)
const HOVER_MAX_ZOOM = 17;

// The SMV layers sit above the boundaries: add the barangay layers below the first SMV layer
const SMV_BOTTOM_ID = "smv-overview";

const tilesUrl = () =>
  `${window.location.origin}${basePath}/api/pages/boundary/barangay/tiles/{z}/{x}/{y}`;

/* ---------------- Expression helpers ---------------- */

// true while the mouse is over this feature (set with setFeatureState)
const isHover: Expr = ["boolean", ["feature-state", "hover"], false];

const fillColor: Expr = ["case", isHover, FILL_HOVER_COLOR, FILL_COLOR];
const lineColor: Expr = ["case", isHover, LINE_HOVER_COLOR, LINE_COLOR];
const fillOpacity = (k: number): Expr => ["case", isHover, FILL_HOVER_OPACITY * k, FILL_OPACITY * k];

const labelSize: Expr = ["interpolate", ["linear"], ["zoom"], LABEL_MIN_ZOOM, 10, 16, 14];

/* ---------------- Component ---------------- */

export default function BarangayLayer() {
  const map = useMapStore((s) => s.map);
  const visible = useMapStore((s) => s.boundary.visible && s.boundary.type === "barangay");
  const hoverable = useMapStore((s) => s.boundary.hoverable);
  const opacity = useMapStore((s) => s.boundary.opacity);

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
        minzoom: MIN_ZOOM,
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
        minzoom: MIN_ZOOM,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": lineColor as any,
          "line-opacity": LINE_OPACITY,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 14, 1, 18, 2],
          "line-dasharray": [1.5, 2],
        },
      },
      before
    );

    // Names: no "text-allow-overlap", so MapLibre detects collisions by itself and hides the
    // labels that would overlap (they come back when you zoom in and there is room).
    // Added on top (no "before") so they are not covered by the SMV roads.
    // A symbol layer never blocks the mouse: hover still reaches the boundary under the text.
    map.addLayer({
      id: LABEL_ID,
      type: "symbol",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      minzoom: LABEL_MIN_ZOOM,
      layout: {
        "text-field": ["get", "bgy_name"],
        "text-font": LABEL_FONT,
        "text-size": labelSize as any,
        "text-max-width": 6,
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": LABEL_COLOR,
        "text-halo-color": LABEL_HALO,
        "text-halo-width": 1.5,
      },
    });
  }, [map]);

  // 2) Visibility + opacity (from the layer control)
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(FILL_ID) || !map.getLayer(LINE_ID) || !map.getLayer(LABEL_ID)) return;

    const v = visible ? "visible" : "none";
    map.setLayoutProperty(FILL_ID, "visibility", v);
    map.setLayoutProperty(LINE_ID, "visibility", v);
    map.setLayoutProperty(LABEL_ID, "visibility", v);
    map.setPaintProperty(FILL_ID, "fill-opacity", fillOpacity(opacity) as any);
    map.setPaintProperty(LINE_ID, "line-opacity", LINE_OPACITY * opacity);
  }, [map, visible, opacity]);

  // 3) Hover (highlight + name box). Only active while "Hoverable" is checked and the
  //    barangay layer is shown; unchecking it (or hiding the layer) removes the handlers
  //    and clears any highlight and name box.
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

      // new barangay under the mouse: highlight it and rebuild the name box (as plain text)
      if (f.id !== hoveredId) {
        if (hoveredId !== null) setHover(hoveredId, false);
        hoveredId = f.id;
        setHover(f.id, true);

        const box = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = String(f.properties?.bgy_name ?? "");
        const region = document.createElement("div");
        region.textContent = [f.properties?.mun_name, f.properties?.pro_name].filter(Boolean).join(", ");
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

  // 4) Remove the layers and source when this component unmounts
  useEffect(() => {
    if (!map) return;
    return () => {
      if (!map.getStyle()) return; // map was already removed
      [LABEL_ID, LINE_ID, FILL_ID].forEach((id) => map.getLayer(id) && map.removeLayer(id));
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}
