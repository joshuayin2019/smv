// FILE: src/components/.../municipality_layer.tsx  (new file; render <MunicipalityLayer /> next to <RegionLayer />, no props needed)
import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { basePath } from "@/lib/config";

type Expr = maplibregl.ExpressionSpecification;

/* ---------------- Config ---------------- */

const SOURCE_ID = "municipality-bndry";
const FILL_ID = "municipality-bndry-fill";
const LINE_ID = "municipality-bndry-line";
const SOURCE_LAYER = "municipality"; // must match the name in ST_AsMVT(..., 'municipality', ...)

// Municipalities are shown from this zoom (a tile holds too many polygons below it).
// Keep the hint text in layer_control.tsx in sync.
const MIN_ZOOM = 10;
const SOURCE_MIN_ZOOM = MIN_ZOOM;
const SOURCE_MAX_ZOOM = 13; // tiles are reused (overzoomed) above this

// Normal and hover look
const FILL_COLOR = "#fdba74";
const FILL_HOVER_COLOR = "#ea580c";
const LINE_COLOR = "#c2410c";
const LINE_HOVER_COLOR = "#9a3412";
const FILL_OPACITY = 0.05;
const FILL_HOVER_OPACITY = 0.35;
const LINE_OPACITY = 0.9;

// Hover (color + names) only while zoomed out to this level (zoomed in, the polygon covers the screen)
const HOVER_MAX_ZOOM = 13;

// The SMV layers sit above the boundaries: add the municipality layers below the first SMV layer
const SMV_BOTTOM_ID = "smv-overview";

const tilesUrl = () =>
  `${window.location.origin}${basePath}/api/pages/boundary/city/tiles/{z}/{x}/{y}`;

/* ---------------- Expression helpers ---------------- */

// true while the mouse is over this feature (set with setFeatureState)
const isHover: Expr = ["boolean", ["feature-state", "hover"], false];

const fillColor: Expr = ["case", isHover, FILL_HOVER_COLOR, FILL_COLOR];
const lineColor: Expr = ["case", isHover, LINE_HOVER_COLOR, LINE_COLOR];
const fillOpacity = (k: number): Expr => ["case", isHover, FILL_HOVER_OPACITY * k, FILL_OPACITY * k];

/* ---------------- Component ---------------- */

export default function MunicipalityLayer() {
  const map = useMapStore((s) => s.map);
  const visible = useMapStore((s) => s.boundary.visible && s.boundary.type === "municipality");
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 11, 1.1, 16, 2],
          "line-dasharray": [1.5, 2],
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

  // 3) Hover: highlight the municipality and show its name (with province and region) next to the mouse.
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

      // new municipality under the mouse: highlight it and rebuild the name box (as plain text)
      if (f.id !== hoveredId) {
        if (hoveredId !== null) setHover(hoveredId, false);
        hoveredId = f.id;
        setHover(f.id, true);

        const box = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = String(f.properties?.mun_name ?? "");
        const region = document.createElement("div");
        region.textContent = [f.properties?.pro_name, f.properties?.reg_name].filter(Boolean).join(", ");
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
      [LINE_ID, FILL_ID].forEach((id) => map.getLayer(id) && map.removeLayer(id));
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}
