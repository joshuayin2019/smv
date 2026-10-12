// components/map/poi_layer.tsx  (POI points + admin-level clustering)
import { useEffect, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { usePoiStore, PoiCollection } from "@/stores/poi_stores";

const POI_SOURCE = "poi";
const GROUP_SOURCE = "poi-groups";
const POI_LAYER = "poi-circles";

// maplibre's own data type, so no global GeoJSON namespace is needed
type GeoJSONData = maplibregl.GeoJSONSourceSpecification["data"];

// Priority order: region -> province -> municipality -> barangay -> individual POIs.
// A layer is visible from minzoom (inclusive) to maxzoom (exclusive).
const LEVELS = [
  { level: "reg", codeKey: "reg_code", nameKey: "region",            minzoom: 0,  maxzoom: 10,  color: "#1c7ed6" },
  { level: "pro", codeKey: "pro_code", nameKey: "province",          minzoom: 10,  maxzoom: 12,  color: "#7048e8" },
  { level: "mun", codeKey: "mun_code", nameKey: "city_municipality", minzoom: 12,  maxzoom: 14, color: "#0ca678" },
  { level: "bgy", codeKey: "bgy_code", nameKey: "barangay",          minzoom: 14, maxzoom: 17, color: "#f08c00" },
] as const;

const POINTS_MINZOOM = 13; // individual POIs appear from here
const GROUP_FONT = ["Montserrat Medium"]; // must exist in the basemap style's glyph server

type Group = {
  code: string;
  name: string;
  count: number;
  sumLng: number;
  sumLat: number;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

// One feature per group at every level, tagged with its level so layers can filter on it.
function buildGroups(poi: PoiCollection): GeoJSONData {
  const features: unknown[] = [];

  for (const lvl of LEVELS) {
    const groups = new Map<string, Group>();

    for (const f of poi.features) {
      if (f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const code = f.properties[lvl.codeKey] ?? "none";
      const name = f.properties[lvl.nameKey] ?? "Unassigned";

      let g = groups.get(code);
      if (!g) {
        g = { code, name, count: 0, sumLng: 0, sumLat: 0, minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
        groups.set(code, g);
      }
      g.count += 1;
      g.sumLng += lng;
      g.sumLat += lat;
      g.minLng = Math.min(g.minLng, lng);
      g.minLat = Math.min(g.minLat, lat);
      g.maxLng = Math.max(g.maxLng, lng);
      g.maxLat = Math.max(g.maxLat, lat);
    }

    for (const g of groups.values()) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [g.sumLng / g.count, g.sumLat / g.count] },
        properties: {
          level: lvl.level,
          code: g.code,
          name: g.name,
          count: g.count,
          minLng: g.minLng,
          minLat: g.minLat,
          maxLng: g.maxLng,
          maxLat: g.maxLat,
        },
      });
    }
  }

  return { type: "FeatureCollection", features } as unknown as GeoJSONData;
}

export default function PoiLayer() {
  const map = useMapStore((s) => s.map);
  const poi = usePoiStore((s) => s.poi);

  // recomputed only when the POI data changes
  const groups = useMemo(() => buildGroups(poi), [poi]);

  // add sources, layers, and handlers once the map is ready
  useEffect(() => {
    if (!map) return;

    const current = usePoiStore.getState().poi; // current value, without re-running on every change

    map.addSource(POI_SOURCE, { type: "geojson", data: current as unknown as GeoJSONData });
    map.addSource(GROUP_SOURCE, { type: "geojson", data: buildGroups(current) });

    // group markers: one circle layer + one label layer per admin level
    for (const lvl of LEVELS) {
      map.addLayer({
        id: `poi-group-${lvl.level}`,
        type: "circle",
        source: GROUP_SOURCE,
        filter: ["==", ["get", "level"], lvl.level],
        minzoom: lvl.minzoom,
        maxzoom: lvl.maxzoom,
        paint: {
          "circle-color": lvl.color,
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          // bigger circle for bigger groups
          "circle-radius": ["step", ["get", "count"], 14, 10, 18, 50, 24, 200, 30],
        },
      });

      map.addLayer({
        id: `poi-group-label-${lvl.level}`,
        type: "symbol",
        source: GROUP_SOURCE,
        filter: ["==", ["get", "level"], lvl.level],
        minzoom: lvl.minzoom,
        maxzoom: lvl.maxzoom,
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": GROUP_FONT,
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
    }

    // individual POIs, only at the closest zoom levels
    map.addLayer({
      id: POI_LAYER,
      type: "circle",
      source: POI_SOURCE,
      minzoom: POINTS_MINZOOM,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 16, 7],
        "circle-color": "#e8590c",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
    });

    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    // click a POI -> popup with its details
    const onPoiClick = (e: maplibregl.MapLayerMouseEvent) => {
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

      new maplibregl.Popup({ closeButton: true }).setLngLat([lng, lat]).setDOMContent(box).addTo(map);
    };

    map.on("click", POI_LAYER, onPoiClick);
    map.on("mouseenter", POI_LAYER, onEnter);
    map.on("mouseleave", POI_LAYER, onLeave);

    // click a group -> zoom in until the next level appears
    const groupHandlers = LEVELS.map((lvl) => {
      const layerId = `poi-group-${lvl.level}`;

      const onGroupClick = (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const p = feature.properties as { minLng: number; minLat: number; maxLng: number; maxLat: number };
        const [lng, lat] = feature.geometry.coordinates as [number, number];

        const bounds = new maplibregl.LngLatBounds([p.minLng, p.minLat], [p.maxLng, p.maxLat]);
        const cam = map.cameraForBounds(bounds, { padding: 80 });

        // fitting the bounds alone can still land inside the same level, so go at least to the next one
        const zoom = Math.min(Math.max(cam?.zoom ?? 0, lvl.maxzoom + 0.2), 17);
        map.easeTo({ center: cam?.center ?? [lng, lat], zoom });
      };

      map.on("click", layerId, onGroupClick);
      map.on("mouseenter", layerId, onEnter);
      map.on("mouseleave", layerId, onLeave);

      return { layerId, onGroupClick };
    });

    return () => {
      try {
        map.off("click", POI_LAYER, onPoiClick);
        map.off("mouseenter", POI_LAYER, onEnter);
        map.off("mouseleave", POI_LAYER, onLeave);

        for (const { layerId, onGroupClick } of groupHandlers) {
          map.off("click", layerId, onGroupClick);
          map.off("mouseenter", layerId, onEnter);
          map.off("mouseleave", layerId, onLeave);
        }

        for (const lvl of LEVELS) {
          if (map.getLayer(`poi-group-label-${lvl.level}`)) map.removeLayer(`poi-group-label-${lvl.level}`);
          if (map.getLayer(`poi-group-${lvl.level}`)) map.removeLayer(`poi-group-${lvl.level}`);
        }
        if (map.getLayer(POI_LAYER)) map.removeLayer(POI_LAYER);
        if (map.getSource(GROUP_SOURCE)) map.removeSource(GROUP_SOURCE);
        if (map.getSource(POI_SOURCE)) map.removeSource(POI_SOURCE);
      } catch {
        // the map was already removed, so there is nothing left to clean up
      }
    };
  }, [map]);

  // push new data into both sources whenever the store changes
  useEffect(() => {
    if (!map) return;
    (map.getSource(POI_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(poi as unknown as GeoJSONData);
    (map.getSource(GROUP_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(groups);
  }, [map, poi, groups]);

  return null;
}