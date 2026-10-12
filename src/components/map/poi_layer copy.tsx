// components/map/poi_layer.tsx  (POI source, layer, and popup)
import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { usePoiStore } from "@/stores/poi_stores";

const POI_SOURCE = "poi";
const POI_LAYER = "poi-circles";

// maplibre's own data type, so no global GeoJSON namespace is needed
type GeoJSONData = maplibregl.GeoJSONSourceSpecification["data"];

export default function PoiLayer() {
  const map = useMapStore((s) => s.map);
  const poi = usePoiStore((s) => s.poi);

  // add the source, layer, and handlers once the map is ready
  useEffect(() => {
    if (!map) return;

    map.addSource(POI_SOURCE, {
      type: "geojson",
      data: usePoiStore.getState().poi as unknown as GeoJSONData, // current value, without re-running on every change
    });

    map.addLayer({
      id: POI_LAYER,
      type: "circle",
      source: POI_SOURCE,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 4, 15, 7],
        "circle-color": "#e8590c",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
    });

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;

      const props = feature.properties ?? {};
      const [lng, lat] = feature.geometry.coordinates as [number, number];

      // build with textContent so values from the database are never parsed as HTML
      const box = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = String(props.name ?? "");
      const category = document.createElement("div");
      category.textContent = String(props.category ?? "");
      const place = document.createElement("div");
      place.textContent = [props.barangay, props.city_municipality, props.province]
        .filter(Boolean)
        .join(", ");
      box.append(title, category, place);

      new maplibregl.Popup({ closeButton: true })
        .setLngLat([lng, lat])
        .setDOMContent(box)
        .addTo(map);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", POI_LAYER, onClick);
    map.on("mouseenter", POI_LAYER, onEnter);
    map.on("mouseleave", POI_LAYER, onLeave);

    return () => {
      try {
        map.off("click", POI_LAYER, onClick);
        map.off("mouseenter", POI_LAYER, onEnter);
        map.off("mouseleave", POI_LAYER, onLeave);
        if (map.getLayer(POI_LAYER)) map.removeLayer(POI_LAYER);
        if (map.getSource(POI_SOURCE)) map.removeSource(POI_SOURCE);
      } catch {
        // the map was already removed, so there is nothing left to clean up
      }
    };
  }, [map]);

  // push new data into the source whenever the store changes
  useEffect(() => {
    if (!map) return;
    const source = map.getSource(POI_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(poi as unknown as GeoJSONData);
  }, [map, poi]);

  return null;
}