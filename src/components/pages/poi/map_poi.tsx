// components/map/poi_layer.tsx  (POI points + admin-level clustering)
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { usePoiStore, PoiCollection, type PoiProperties } from "@/stores/poi_stores";
import { useGlobalStore } from "@/stores/global_stores";
import { reverseGeocode, type Place } from "@/lib/openroute";
import PoiDetailsWindow from "./poi_details_window";


const POI_PAGE = "Point of Interest"; // activePage value of the POI navbar item

const POI_SOURCE = "poi";
const GROUP_SOURCE = "poi-groups";
const POI_LAYER = "poi-circles";

const DEFAULT_ICON = "poi-default";
const ICON_PREFIX = "cat-";
const ICON_URL = (id: string) => `/api/pages/poi/category-icons/${encodeURIComponent(id)}`;
const ICON_PX = 36; // rasterised size; shown at 24px with pixelRatio 2 (crisp on retina)

// maplibre's own data type, so no global GeoJSON namespace is needed
type GeoJSONData = maplibregl.GeoJSONSourceSpecification["data"];

// Priority order: all -> region -> province -> municipality -> barangay -> individual POIs.
// A layer is visible from minzoom (inclusive) to maxzoom (exclusive).
// "all" has no codeKey/nameKey: every POI is merged into a single group.
const LEVELS = [
  { level: "all", codeKey: null,       nameKey: null,                minzoom: 0,  maxzoom: 10, color: "#495057" },
  { level: "reg", codeKey: "reg_code", nameKey: "region",            minzoom: 10, maxzoom: 11, color: "#1c7ed6" },
  { level: "pro", codeKey: "pro_code", nameKey: "province",          minzoom: 11, maxzoom: 12, color: "#7048e8" },
  { level: "mun", codeKey: "mun_code", nameKey: "city_municipality", minzoom: 12, maxzoom: 14, color: "#0ca678" },
  { level: "bgy", codeKey: "bgy_code", nameKey: "barangay",          minzoom: 14, maxzoom: 16, color: "#f08c00" },
] as const;

const POINTS_MINZOOM = 16; // individual POIs appear from here (right after the last group level)
const POINTS_MAXZOOM = 18; // zoom cap when clicking the last group level (bgy -> individual POIs)
const ZOOM_EPS = 0.01; // keeps the target strictly inside the next level's [minzoom, maxzoom)
const SELECT_ZOOM = 17; // minimum zoom when a POI is selected (table row or map click); individual POIs show from 16
const SELECT_FLY_MS = 800; // duration of the fly-to animation
const GROUP_FONT = ["Montserrat Medium"]; // must exist in the basemap style's glyph server

// Selected POI highlight: a bigger copy of its icon + a pulsing blue glow (same blue as the old Leaflet version)
const SELECTED_SOURCE = "poi-selected";
const SELECTED_PULSE_LAYER = "poi-selected-pulse";
const SELECTED_ICON_LAYER = "poi-selected-icon";
const SELECTED_COLOR = "#228be6";
const PULSE_MS = 1200; // one heartbeat cycle (two quick beats, then a short rest)
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] } as unknown as GeoJSONData;

// cat-<category_id> if that image is registered, otherwise the default dot (shared by the normal and the selected layer)
const ICON_IMAGE_EXPR = [
  "coalesce",
  ["image", ["concat", ICON_PREFIX, ["to-string", ["get", "category_id"]]]],
  ["image", DEFAULT_ICON],
] as unknown as maplibregl.ExpressionSpecification;

// Icon size of the selected POI; `scale` is the heartbeat factor (1 = resting size)
const selectedIconSize = (scale: number) =>
  ["interpolate", ["linear"], ["zoom"], 14, 1.0 * scale, 17, 1.5 * scale] as unknown as maplibregl.ExpressionSpecification;

// smooth 0..1 bump centred on `center`
const bump = (t: number, center: number, width: number) => Math.exp(-(((t - center) / width) ** 2));

// "lub-dub": a strong beat, a smaller second beat, then a rest (t goes 0 -> 1 over one cycle)
const heartbeatScale = (t: number) => 1 + 0.3 * bump(t, 0.12, 0.06) + 0.2 * bump(t, 0.32, 0.07);

const EXTENT_PADDING = 60; // px of breathing room around the data when zooming to its extent
const EXTENT_MAXZOOM = 15; // stops a single POI (or a tiny cluster) from zooming in too far
const PANEL_SETTLE_MS = 400; // longer than the splitter transition (300ms), so the pane has its final size
const MIN_MAP_HEIGHT = 80; // px; below this the visible map is practically hidden (e.g. panel at 100%)

// Directions (OpenRouteService): route lines + start/end markers
const ROUTE_SOURCE = "poi-route";
const ROUTE_POINT_SOURCE = "poi-route-points";
const ROUTE_CASING_LAYER = `${ROUTE_SOURCE}-casing`;
const ROUTE_LINE_LAYER = `${ROUTE_SOURCE}-line`;
const ROUTE_POINT_LAYER = `${ROUTE_POINT_SOURCE}-circles`;
const ROUTE_COLOR = "#1c7ed6"; // selected route
const ROUTE_ALT_COLOR = "#868e96"; // alternative routes
const ROUTE_FIT_PADDING = 80; // px around the routes when zooming to them
const ROUTE_FIT_MAXZOOM = 17;

// zoom range of the level that comes after LEVELS[index]
// (all -> reg -> pro -> mun -> bgy -> individual POIs)
function nextLevelRange(index: number): { min: number; max: number } {
  const next = LEVELS[index + 1];
  return next ? { min: next.minzoom, max: next.maxzoom } : { min: POINTS_MINZOOM, max: POINTS_MAXZOOM };
}

// Height (px) of the map canvas that sticks out below the visible pane, i.e. the part hidden
// behind the bottom panel. 0 when the canvas already matches the pane.
function hiddenHeight(map: maplibregl.Map, pane: HTMLElement | null | undefined): number {
  if (!pane) return 0;
  return Math.max(0, map.getContainer().clientHeight - pane.clientHeight);
}

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

      // "all" level: a single shared group; other levels group by their code column
      const code = lvl.codeKey ? f.properties[lvl.codeKey] ?? "none" : "all";
      const name = lvl.nameKey ? f.properties[lvl.nameKey] ?? "Unassigned" : "All POIs";

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

// bounding box of every POI point (empty bounds when there are no points)
function getPoiBounds(poi: PoiCollection): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  for (const f of poi.features) {
    if (f.geometry.type !== "Point") continue;
    bounds.extend(f.geometry.coordinates as [number, number]);
  }
  return bounds;
}

// distinct category_id values present in the POI data
function collectCategoryIds(poi: PoiCollection): string[] {
  const ids = new Set<string>();
  for (const f of poi.features) {
    const id = (f.properties as Record<string, unknown>).category_id;
    if (id !== null && id !== undefined && id !== "") ids.add(String(id));
  }
  return [...ids];
}

// plain dot used when a category has no svg (or it has not loaded yet)
function makeDefaultIcon(): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_PX;
  canvas.height = ICON_PX;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(ICON_PX / 2, ICON_PX / 2, ICON_PX / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "#e8590c";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  return ctx.getImageData(0, 0, ICON_PX, ICON_PX);
}

// fetch one svg through the route and register it on the map as `cat-<id>`
async function loadCategoryIcon(map: maplibregl.Map, id: string): Promise<boolean> {
  const name = `${ICON_PREFIX}${id}`;
  if (map.hasImage(name)) return true;

  const img = new Image(ICON_PX, ICON_PX); // explicit size so svgs with only a viewBox still rasterise
  img.src = ICON_URL(id);
  try {
    await img.decode();
  } catch {
    return false; // 404 or invalid svg -> POIs of this category use the default dot
  }
  if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
  return true;
}

type PoiLayerProps = {
  // The element that shows the map (the top splitter pane). Its height is the visible map height;
  // anything the canvas has beyond that is hidden behind the bottom panel.
  mapPaneRef?: RefObject<HTMLElement | null>;
};

export default function PoiLayer({ mapPaneRef }: PoiLayerProps) {
  const activePage = useGlobalStore((s) => s.activePage);
  const map = useMapStore((s) => s.map);
  const poi = usePoiStore((s) => s.poi);
  const selectedPoi = usePoiStore((s) => s.selectedPoi);

  // Directions state (written by the Directions tab in the details window, drawn here)
  const routes = usePoiStore((s) => s.routes);
  const selectedRoute = usePoiStore((s) => s.selectedRoute);
  const routeFrom = usePoiStore((s) => s.routeFrom);
  const routeTo = usePoiStore((s) => s.routeTo);
  const pickingFrom = usePoiStore((s) => s.pickingFrom);
  const setPickingFrom = usePoiStore((s) => s.setPickingFrom);
  const setPickedPoint = usePoiStore((s) => s.setPickedPoint);

  // recomputed only when the POI data changes
  const groups = useMemo(() => buildGroups(poi), [poi]);

  // category ids already tried (loaded or failed), so we never request the same svg twice
  const triedIcons = useRef<Set<string>>(new Set());

  //For active page handler to avoid blinking\
  const activePageRef = useRef(activePage);
  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  // Keep the map canvas the same size as its container (and the pane) whenever they change
  useEffect(() => {
    if (!map) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.resize());
    });
    observer.observe(map.getContainer());
    if (mapPaneRef?.current) observer.observe(mapPaneRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map, mapPaneRef]);

  // true from the moment the POI page is opened until the map has zoomed to the data
  const zoomPending = useRef(false);

  // opening the POI page asks for a zoom to the data extent
  useEffect(() => {
    if (activePage === POI_PAGE) zoomPending.current = true;
  }, [activePage]);

  // zoom to the extent of the POI data, fitted into the part of the map that is actually visible
  useEffect(() => {
    if (!map || activePage !== POI_PAGE || !zoomPending.current) return;
    if (poi.features.length === 0) return; // data not loaded yet; runs again when it arrives

    // wait for the splitter transition to finish so the pane has its final height
    const timer = window.setTimeout(() => {
      if (!zoomPending.current) return;

      map.resize();
      const hidden = hiddenHeight(map, mapPaneRef?.current);
      const visible = map.getContainer().clientHeight - hidden;
      if (visible < MIN_MAP_HEIGHT) return; // map is (almost) hidden, e.g. panel at 100%

      const bounds = getPoiBounds(poi);
      if (bounds.isEmpty()) return;

      const pad = Math.min(EXTENT_PADDING, visible / 4); // never larger than the map can take
      zoomPending.current = false;
      map.fitBounds(bounds, {
        // extra bottom padding = the strip of the canvas hidden behind the panel
        padding: { top: pad, left: pad, right: pad, bottom: pad + hidden },
        maxZoom: EXTENT_MAXZOOM,
        duration: 800,
      });
    }, PANEL_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [map, activePage, poi, mapPaneRef]);

  // add sources, layers, and handlers once the map is ready
  useEffect(() => {
    if (!map) return;

    const current = usePoiStore.getState().poi; // current value, without re-running on every change

    if (!map.hasImage(DEFAULT_ICON)) map.addImage(DEFAULT_ICON, makeDefaultIcon(), { pixelRatio: 2 });

    map.addSource(POI_SOURCE, { type: "geojson", data: current as unknown as GeoJSONData });
    map.addSource(GROUP_SOURCE, { type: "geojson", data: buildGroups(current) });

    // group markers: one circle layer + one label layer per level
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

    // individual POIs with their category svg, only at the closest zoom levels
    map.addLayer({
      id: POI_LAYER,
      type: "symbol",
      source: POI_SOURCE,
      minzoom: POINTS_MINZOOM,
      layout: {
        "icon-image": ICON_IMAGE_EXPR,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.7, 17, 1],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });

    // selected POI: holds a single feature, filled by the effect further down.
    // Added after the POI layer so it draws on top: first the pulsing glow, then the bigger icon.
    const selectedNow = usePoiStore.getState().selectedPoi;
    map.addSource(SELECTED_SOURCE, {
      type: "geojson",
      data: selectedNow
        ? ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [selectedNow.lng, selectedNow.lat] },
            properties: { category_id: selectedNow.properties.category_id },
          } as unknown as GeoJSONData)
        : EMPTY_COLLECTION,
    });
    map.addLayer({
      id: SELECTED_PULSE_LAYER,
      type: "circle",
      source: SELECTED_SOURCE,
      minzoom: POINTS_MINZOOM,
      // radius and opacity are animated by the effect further down
      paint: { "circle-color": SELECTED_COLOR, "circle-opacity": 0.4, "circle-radius": 14, "circle-blur": 0.6 },
    });
    map.addLayer({
      id: SELECTED_ICON_LAYER,
      type: "symbol",
      source: SELECTED_SOURCE,
      minzoom: POINTS_MINZOOM,
      layout: {
        "icon-image": ICON_IMAGE_EXPR,
        // about 1.5x the normal icon (old version: 28px vs 18px); the heartbeat effect scales it further
        "icon-size": selectedIconSize(1),
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
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
      try {
        if (activePageRef.current !== POI_PAGE) return;
        if (usePoiStore.getState().pickingCenter) return; // the click is picking the radius center
        if (usePoiStore.getState().pickingFrom) return; // the click is picking the route start

        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const [lng, lat] = feature.geometry.coordinates as [number, number];

        // Use the original record from the store (the map's copy can lose null values / change types)
        // look it up by id (fid is not unique in the data)
        const poiId = (feature.properties as { id?: number } | null)?.id;
        const full = usePoiStore.getState().poi.features.find((f) => f.properties.id === poiId);
        const properties = full?.properties ?? (feature.properties as unknown as PoiProperties);

        usePoiStore.getState().setSelectedPoi({ properties, lng, lat });
      } catch (err) {
        console.warn("POI click failed:", err instanceof Error ? err.message : err);
      }
    };

    map.on("click", POI_LAYER, onPoiClick);
    map.on("mouseenter", POI_LAYER, onEnter);
    map.on("mouseleave", POI_LAYER, onLeave);

    // click a group -> zoom into the NEXT level only (all -> reg -> pro -> mun -> bgy -> POIs)
    const groupHandlers = LEVELS.map((lvl, index) => {
      const layerId = `poi-group-${lvl.level}`;
      const next = nextLevelRange(index);

      const onGroupClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (usePoiStore.getState().pickingCenter) return; // the click is picking the radius center
        if (usePoiStore.getState().pickingFrom) return; // the click is picking the route start

        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const p = feature.properties as { minLng: number; minLat: number; maxLng: number; maxLat: number };
        const [lng, lat] = feature.geometry.coordinates as [number, number];

        map.resize(); // make sure the canvas matches its container before measuring
        const hidden = hiddenHeight(map, mapPaneRef?.current); // strip hidden behind the bottom panel

        const bounds = new maplibregl.LngLatBounds([p.minLng, p.minLat], [p.maxLng, p.maxLat]);
        // fit into the visible part only: the hidden strip counts as extra bottom padding
        const cam = map.cameraForBounds(bounds, {
          padding: { top: 80, left: 80, right: 80, bottom: 80 + hidden },
        });

        // Fit the group's bounds, but keep the zoom inside the next level's range:
        //  - too far out -> raised to the next level's minzoom (so it never stays on the same level)
        //  - too far in  -> capped just under the next level's maxzoom (so it never skips a level)
        const minZoom = next.min + ZOOM_EPS;
        const maxZoom = next.max - ZOOM_EPS;
        const fitZoom = cam?.zoom ?? minZoom;
        const zoom = Math.min(Math.max(fitZoom, minZoom), maxZoom);
        const clamped = fitZoom < minZoom || fitZoom > maxZoom;

        // The marker sits at the average of its POIs, not at the middle of the bounding box.
        //  - zoom not clamped -> the whole group fits, so centre on the bounds (group fully visible);
        //                        cam.center already accounts for the hidden strip
        //  - zoom clamped     -> the bounds no longer fit anyway, so centre on the clicked marker,
        //                        shifted up by half the hidden strip so it lands in the middle of
        //                        the VISIBLE map instead of the middle of the full canvas
        let center: [number, number] = [lng, lat];
        let offset: [number, number] = [0, -hidden / 2];
        if (!clamped && cam?.center) {
          const resolvedCenter = maplibregl.LngLat.convert(cam.center);
          center = [resolvedCenter.lng, resolvedCenter.lat];
          offset = [0, 0];
        }

        map.easeTo({ center, zoom, offset });
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
        if (map.getLayer(SELECTED_ICON_LAYER)) map.removeLayer(SELECTED_ICON_LAYER);
        if (map.getLayer(SELECTED_PULSE_LAYER)) map.removeLayer(SELECTED_PULSE_LAYER);
        if (map.getSource(SELECTED_SOURCE)) map.removeSource(SELECTED_SOURCE);
        if (map.getLayer(POI_LAYER)) map.removeLayer(POI_LAYER);
        if (map.getSource(GROUP_SOURCE)) map.removeSource(GROUP_SOURCE);
        if (map.getSource(POI_SOURCE)) map.removeSource(POI_SOURCE);
        if (map.hasImage(DEFAULT_ICON)) map.removeImage(DEFAULT_ICON);

        // images are gone with the layer cleanup, so allow them to be loaded again next time
        triedIcons.current.clear();
      } catch {
        // the map was already removed, so there is nothing left to clean up
      }
    };
  }, [map, mapPaneRef]);

  // push new data into both sources whenever the store changes
  useEffect(() => {
    if (!map) return;
    (map.getSource(POI_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(poi as unknown as GeoJSONData);
    (map.getSource(GROUP_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(groups);
  }, [map, poi, groups]);

  // load the svg for every category that appears in the data (only the ones not tried yet)
  useEffect(() => {
    if (!map) return;

    const pending = collectCategoryIds(poi).filter((id) => !triedIcons.current.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => triedIcons.current.add(id));

    // adding an image makes maplibre re-render the layer, so POIs switch from the dot to their icon
    Promise.all(pending.map((id) => loadCategoryIcon(map, id).catch(() => false)));
  }, [map, poi]);

  // ----- Directions: sources + layers (declared after the POI layers exist) -----
  // route lines sit under the POI icons, the start/end markers above them but under the selected highlight
  useEffect(() => {
    if (!map) return;

    map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_COLLECTION });
    map.addSource(ROUTE_POINT_SOURCE, { type: "geojson", data: EMPTY_COLLECTION });

    const beforeLines = map.getLayer(POI_LAYER) ? POI_LAYER : undefined;
    const beforeMarkers = map.getLayer(SELECTED_PULSE_LAYER) ? SELECTED_PULSE_LAYER : undefined;
    const sortKey = ["case", ["get", "selected"], 1, 0] as unknown as maplibregl.ExpressionSpecification;

    // white casing so the line stays readable on any basemap
    map.addLayer(
      {
        id: ROUTE_CASING_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round", "line-sort-key": sortKey },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["case", ["get", "selected"], 9, 7],
          "line-opacity": 0.9,
        },
      },
      beforeLines
    );

    map.addLayer(
      {
        id: ROUTE_LINE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round", "line-sort-key": sortKey },
        paint: {
          "line-color": ["case", ["get", "selected"], ROUTE_COLOR, ROUTE_ALT_COLOR],
          "line-width": ["case", ["get", "selected"], 5, 4],
          "line-opacity": ["case", ["get", "selected"], 1, 0.75],
        },
      },
      beforeLines
    );

    // start (green) and end (red) markers
    map.addLayer(
      {
        id: ROUTE_POINT_LAYER,
        type: "circle",
        source: ROUTE_POINT_SOURCE,
        paint: {
          "circle-radius": 8,
          "circle-color": ["match", ["get", "kind"], "from", "#2f9e44", "#e03131"],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      },
      beforeMarkers
    );

    return () => {
      try {
        if (map.getLayer(ROUTE_POINT_LAYER)) map.removeLayer(ROUTE_POINT_LAYER);
        if (map.getLayer(ROUTE_LINE_LAYER)) map.removeLayer(ROUTE_LINE_LAYER);
        if (map.getLayer(ROUTE_CASING_LAYER)) map.removeLayer(ROUTE_CASING_LAYER);
        if (map.getSource(ROUTE_POINT_SOURCE)) map.removeSource(ROUTE_POINT_SOURCE);
        if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
      } catch {
        // the map was already removed, so there is nothing left to clean up
      }
    };
  }, [map]);

  // draw the route lines (selected one highlighted, alternatives in gray)
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (routes.length === 0) {
      src.setData(EMPTY_COLLECTION);
      return;
    }

    // ORS already returns [lng, lat], which is exactly what GeoJSON / maplibre expect
    src.setData({
      type: "FeatureCollection",
      features: routes.map((r, i) => ({
        type: "Feature",
        properties: { selected: i === selectedRoute },
        geometry: { type: "LineString", coordinates: r.coordinates },
      })),
    } as unknown as GeoJSONData);
  }, [map, routes, selectedRoute]);

  // start / end markers (the end marker only shows once there is a route to point at)
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(ROUTE_POINT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: unknown[] = [];
    const add = (p: Place | null, kind: "from" | "to") => {
      if (!p) return;
      features.push({
        type: "Feature",
        properties: { kind },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      });
    };
    add(routeFrom, "from");
    if (routes.length > 0) add(routeTo, "to");

    src.setData({ type: "FeatureCollection", features } as unknown as GeoJSONData);
  }, [map, routeFrom, routeTo, routes]);

  // zoom to the routes when a NEW set arrives (not when only the selected route changes),
  // fitted into the part of the map that is actually visible
  useEffect(() => {
    if (!map || routes.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const r of routes) {
      for (const c of r.coordinates) bounds.extend(c);
    }
    if (bounds.isEmpty()) return;

    map.resize(); // make sure the canvas matches its container before measuring
    const hidden = hiddenHeight(map, mapPaneRef?.current); // strip hidden behind the bottom panel
    map.fitBounds(bounds, {
      padding: {
        top: ROUTE_FIT_PADDING,
        left: ROUTE_FIT_PADDING,
        right: ROUTE_FIT_PADDING,
        bottom: ROUTE_FIT_PADDING + hidden,
      },
      maxZoom: ROUTE_FIT_MAXZOOM,
      duration: 600,
    });
  }, [map, routes, mapPaneRef]);

  // while picking, the next map click becomes the route start point (Esc cancels)
  useEffect(() => {
    if (!map || !pickingFrom) return;

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      setPickingFrom(false);

      // use the coordinates right away; replace the name once the reverse geocode answers
      let place: Place = {
        name: "Picked location",
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lon: lng,
      };
      try {
        place = (await reverseGeocode(lat, lng)) ?? place;
      } catch {
        // keep the coordinates-only place
      }
      setPickedPoint({ ...place }); // new object every time, so the Directions tab reacts
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setPickingFrom(false);
    };

    map.on("click", onClick);
    window.addEventListener("keydown", onKey);
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("click", onClick);
      window.removeEventListener("keydown", onKey);
      try {
        map.getCanvas().style.cursor = "";
      } catch {
        // canvas is gone together with the map
      }
    };
  }, [map, pickingFrom, setPickingFrom, setPickedPoint]);

  // put the selected POI into the highlight source (cleared when nothing is selected or on another page)
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SELECTED_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!selectedPoi || activePage !== POI_PAGE) {
      src.setData(EMPTY_COLLECTION);
      return;
    }
    src.setData({
      type: "Feature",
      geometry: { type: "Point", coordinates: [selectedPoi.lng, selectedPoi.lat] },
      properties: { category_id: selectedPoi.properties.category_id },
    } as unknown as GeoJSONData);
  }, [map, selectedPoi, activePage]);

  // heartbeat on the selected POI: the icon beats "lub-dub" while a glow expands and fades around it
  useEffect(() => {
    if (!map || !selectedPoi || activePage !== POI_PAGE) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = ((now - start) % PULSE_MS) / PULSE_MS; // 0 -> 1, then starts over
      try {
        if (map.getLayer(SELECTED_PULSE_LAYER)) {
          map.setPaintProperty(SELECTED_PULSE_LAYER, "circle-radius", 14 + 12 * t); // grows
          map.setPaintProperty(SELECTED_PULSE_LAYER, "circle-opacity", 0.45 * (1 - t)); // fades out
        }
        if (map.getLayer(SELECTED_ICON_LAYER)) {
          map.setLayoutProperty(SELECTED_ICON_LAYER, "icon-size", selectedIconSize(heartbeatScale(t)));
        }
      } catch {
        // style not ready or map removed: the next frame (or the cleanup) handles it
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      // back to the resting size
      try {
        if (map.getLayer(SELECTED_ICON_LAYER)) map.setLayoutProperty(SELECTED_ICON_LAYER, "icon-size", selectedIconSize(1));
      } catch {
        // map already removed
      }
    };
  }, [map, selectedPoi, activePage]);

  // zoom to the selected POI, whether it was picked in the table or clicked on the map.
  // A new selection object is created on every click, so clicking the same POI again re-centers it.
  useEffect(() => {
    if (!map || !selectedPoi || activePageRef.current !== POI_PAGE) return;

    map.resize(); // make sure the canvas matches its container before measuring
    const hidden = hiddenHeight(map, mapPaneRef?.current); // strip hidden behind the bottom panel

    map.easeTo({
      center: [selectedPoi.lng, selectedPoi.lat],
      // never zoom OUT if the user is already closer than SELECT_ZOOM
      zoom: Math.max(map.getZoom(), SELECT_ZOOM),
      // shift up by half the hidden strip so the POI lands in the middle of the VISIBLE map
      offset: [0, -hidden / 2],
      duration: SELECT_FLY_MS,
    });
  }, [map, selectedPoi, mapPaneRef]);

  // the details window floats above the map (rendered in a portal), so it can live here
  return <PoiDetailsWindow />;
}
