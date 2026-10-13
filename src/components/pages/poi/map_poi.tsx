// components/map/poi_layer.tsx  (POI points + admin-level clustering)
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";
import { usePoiStore, PoiCollection, type PoiProperties } from "@/stores/poi_stores";
import { useGlobalStore } from "@/stores/global_stores";
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

const EXTENT_PADDING = 60; // px of breathing room around the data when zooming to its extent
const EXTENT_MAXZOOM = 15; // stops a single POI (or a tiny cluster) from zooming in too far
const PANEL_SETTLE_MS = 400; // longer than the splitter transition (300ms), so the pane has its final size
const MIN_MAP_HEIGHT = 80; // px; below this the visible map is practically hidden (e.g. panel at 100%)

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
        // cat-<category_id> if that image is registered, otherwise the default dot
        "icon-image": [
          "coalesce",
          ["image", ["concat", ICON_PREFIX, ["to-string", ["get", "category_id"]]]],
          ["image", DEFAULT_ICON],
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.7, 17, 1],
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
        console.error("POI click failed:", err instanceof Error ? err.message : err);
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