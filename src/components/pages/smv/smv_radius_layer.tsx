// components/map/smv_radius_layer.tsx  (radius circle + "pick center on map" for the SMV table)
import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { useSmvStore, effectiveRadiusM } from "@/stores/smv_stores";

const SRC = "smv-radius";
const FILL_LAYER = `${SRC}-fill`;
const LINE_LAYER = `${SRC}-line`;
const BELOW_LAYER = "smv-overview"; // draw the circle under the roads when they exist

type GeoJSONData = maplibregl.GeoJSONSourceSpecification["data"];

const EMPTY = { type: "FeatureCollection", features: [] } as unknown as GeoJSONData;

// Approximates a circle on the globe as a polygon (great-circle destination points)
function circle(lng: number, lat: number, km: number, steps = 96): GeoJSONData {
  const rad = Math.PI / 180;
  const d = km / 6371; // angular distance
  const phi1 = lat * rad;
  const lambda1 = lng * rad;

  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps;
    const phi2 = Math.asin(
      Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(bearing)
    );
    const lambda2 =
      lambda1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(phi1),
        Math.cos(d) - Math.sin(phi1) * Math.sin(phi2)
      );
    ring.push([lambda2 / rad, phi2 / rad]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  } as unknown as GeoJSONData;
}

export default function SmvRadiusLayer() {
  const map = useMapStore((s) => s.map);
  const radius = useSmvStore((s) => s.radius);
  const picking = useSmvStore((s) => s.pickingCenter);
  const setRadius = useSmvStore((s) => s.setRadius);
  const setPicking = useSmvStore((s) => s.setPickingCenter);

  // source + layers (declared first so the data effect below always finds the source)
  useEffect(() => {
    if (!map) return;

    const before = map.getLayer(BELOW_LAYER) ? BELOW_LAYER : undefined;

    map.addSource(SRC, { type: "geojson", data: EMPTY });
    map.addLayer(
      {
        id: FILL_LAYER,
        type: "fill",
        source: SRC,
        paint: { "fill-color": "#1c7ed6", "fill-opacity": 0.12 },
      },
      before
    );
    map.addLayer(
      {
        id: LINE_LAYER,
        type: "line",
        source: SRC,
        paint: { "line-color": "#1c7ed6", "line-width": 2 },
      },
      before
    );

    return () => {
      try {
        if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
        if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        // the map was already removed, so there is nothing left to clean up
      }
    };
  }, [map]);

  // draw / clear the circle whenever the radius inputs change
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const { lat, lng, m } = radius;
    if (typeof lat !== "number" || typeof lng !== "number") {
      src.setData(EMPTY);
      return;
    }
    src.setData(circle(lng, lat, effectiveRadiusM(m) / 1000)); // circle() works in km
  }, [map, radius]);

  // while picking, the next map click becomes the radius center
  useEffect(() => {
    if (!map || !picking) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      setRadius({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) });
      setPicking(false);
    };

    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("click", onClick);
      try {
        map.getCanvas().style.cursor = "";
      } catch {
        // canvas is gone together with the map
      }
    };
  }, [map, picking, setRadius, setPicking]);

  return null;
}