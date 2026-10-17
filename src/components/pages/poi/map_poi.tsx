// components/map/poi_layer.tsx  (POI points + vector-tile clustering)
import { useEffect, useRef, type RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";

import { useGlobalStore } from "@/stores/global_stores";
import { usePoiStore, type PoiProperties } from "@/stores/poi_stores";
import { reverseGeocode, type Place } from "@/lib/openroute";
import PoiDetailsWindow from "./poi_details_window";
import { POI_TILES_URL } from "@/lib/config";


const POI_PAGE = "Point of Interest"; // activePage value of the POI navbar item

// Vector tile source (clustering is done by the tile route: features WITH a point_count property are clusters)
const POI_SOURCE = "poi";
const POI_SOURCE_LAYER = "poi";
const TILE_MINZOOM = 5; // no tile requests below this zoom
const TILE_MAXZOOM = 17; // z17 tiles hold the real points (route: CLUSTER_MAX_ZOOM = 16); higher zooms reuse (overzoom) them

// Clusters show below this zoom, individual POI markers from this zoom up.
// Must match CLUSTER_MAX_ZOOM + 1 in the tile route (CLUSTER_MAX_ZOOM = 16).
// TILE_MAXZOOM must be >= this value, otherwise the map never requests a tile that contains points.
const POI_POINTS_MINZOOM = 17;

const CLUSTER_LAYER = "poi-clusters";
const CLUSTER_COUNT_LAYER = "poi-cluster-count";
const POI_LAYER = "poi-circles";

const ICON_PREFIX = "cat-";
const ICON_URL = (id: string) => `/api/pages/poi/category-icons/${encodeURIComponent(id)}`;
const ICON_PX = 36; // rasterised size; shown at 24px with pixelRatio 2 (crisp on retina)

// Full record of one POI (everything except the geometry)
const POI_DETAILS_URL = (id: string | number) =>
  `/api/pages/poi/details/${encodeURIComponent(String(id))}`;

// maplibre's own data type, so no global GeoJSON namespace is needed
type GeoJSONData = maplibregl.GeoJSONSourceSpecification["data"];

// Cluster tiles always carry point_count (even for a cell with a single POI), point tiles never do.
// Checking for the property (not its value) keeps stray one-POI cells from drawing as dots at low zoom.
const IS_CLUSTER = ["has", "point_count"] as unknown as maplibregl.FilterSpecification;
const IS_POINT = ["!", ["has", "point_count"]] as unknown as maplibregl.FilterSpecification;


const GROUP_FONT = ["Montserrat Medium"]; // must exist in the basemap style's glyph server

const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] } as unknown as GeoJSONData;

// cat-<category_id>. When that image is not registered yet, the missing-image resolver (below)
// loads the svg and maplibre waits for it, so the tile is drawn with the real icon.
const ICON_IMAGE_EXPR = [
  "concat",
  ICON_PREFIX,
  ["to-string", ["get", "category_id"]],
] as unknown as maplibregl.ExpressionSpecification;


// Selected POI highlight: a bigger copy of its icon + a pulsing blue glow.
// It has its own source with one feature, so it also shows for a POI picked in the table.
const SELECTED_SOURCE = "poi-selected";
const SELECTED_PULSE_LAYER = "poi-selected-pulse";
const SELECTED_ICON_LAYER = "poi-selected-icon";
const SELECTED_COLOR = "#228be6";
const PULSE_MS = 1200; // one heartbeat cycle (two quick beats, then a short rest)
// minimum zoom when a POI is selected (table row or map click). Must be >= POI_POINTS_MINZOOM,
// otherwise the selected POI would still be inside a cluster.
const SELECT_ZOOM = POI_POINTS_MINZOOM;
const SELECT_FLY_MS = 800; // duration of the fly-to animation

// Icon size of the selected POI; `scale` is the heartbeat factor (1 = resting size)
const selectedIconSize = (scale: number) =>
  ["interpolate", ["linear"], ["zoom"], 14, 1.0 * scale, 17, 1.5 * scale] as unknown as maplibregl.ExpressionSpecification;

// smooth 0..1 bump centred on `center`
const bump = (t: number, center: number, width: number) => Math.exp(-(((t - center) / width) ** 2));

// "lub-dub": a strong beat, a smaller second beat, then a rest (t goes 0 -> 1 over one cycle)
const heartbeatScale = (t: number) => 1 + 0.3 * bump(t, 0.12, 0.06) + 0.2 * bump(t, 0.32, 0.07);


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

// every layer this component owns, so the layer control can show/hide them together
const POI_LAYER_IDS = [
  CLUSTER_LAYER,
  CLUSTER_COUNT_LAYER,
  POI_LAYER,
  SELECTED_PULSE_LAYER,
  SELECTED_ICON_LAYER,
  ROUTE_CASING_LAYER,
  ROUTE_LINE_LAYER,
  ROUTE_POINT_LAYER,
];

// Height (px) of the map canvas that sticks out below the visible pane, i.e. the part hidden
// behind the bottom panel. 0 when the canvas already matches the pane.
function hiddenHeight(map: maplibregl.Map, pane: HTMLElement | null | undefined): number {
  if (!pane) return 0;
  return Math.max(0, map.getContainer().clientHeight - pane.clientHeight);
}

// tile url with the user's scope attached, e.g. .../{z}/{x}/{y}?scope=%5B%7B...%7D%5D
// (the tile route reads the `scope` query parameter)
function buildTilesUrl(scopeKey: string): string {
  const base = POI_TILES_URL();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}scope=${encodeURIComponent(scopeKey)}`;
}


// plain dot used for categories that have no svg (or whose svg fails to load)
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

// fetch one svg through the route and register it on the map under `imageId` (= cat-<id>).
// Always leaves an image behind: the svg, or the default dot when there is none / it fails.
async function registerCategoryIcon(map: maplibregl.Map, imageId: string): Promise<void> {
  const categoryId = imageId.slice(ICON_PREFIX.length);

  let img: HTMLImageElement | null = null;
  if (categoryId !== "") {
    const candidate = new Image(ICON_PX, ICON_PX); // explicit size so svgs with only a viewBox still rasterise
    candidate.src = ICON_URL(categoryId);
    try {
      await candidate.decode();
      img = candidate;
    } catch {
      img = null; // 404 or invalid svg -> default dot
    }
  }

  try {
    if (map.hasImage(imageId)) return;
    if (img) map.addImage(imageId, img, { pixelRatio: 2 });
    else map.addImage(imageId, makeDefaultIcon(), { pixelRatio: 2 });
  } catch {
    // the map was removed while the svg was loading
  }
}

type PoiLayerProps = {
  // The element that shows the map (the top splitter pane). Its height is the visible map height;
  // anything the canvas has beyond that is hidden behind the bottom panel.
  mapPaneRef?: RefObject<HTMLElement | null>;
  // Layer control toggle: hides every POI and route layer when false
  visible?: boolean;
};

export default function PoiLayer({ mapPaneRef, visible = true }: PoiLayerProps) {
  const activePage = useGlobalStore((s) => s.activePage);
  const map = useMapStore((s) => s.map);
  const selectedPoi = usePoiStore((s) => s.selectedPoi);

  // scope of the logged-in user (same value MapDataManagement sends), compared by content
  const scopePoi = useGlobalStore((s) => s.auth?.scope_poi);
  const scopeKey = JSON.stringify(scopePoi ?? []);

  // always holds the latest scope, so the layer-setup effect can read it without depending on it
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  // icons being loaded right now (image id -> its load). Every request for the same icon waits on the same load.
  const pendingIcons = useRef<Map<string, Promise<void>>>(new Map());

  // Directions state (written by the Directions tab in the details window, drawn here)
  const routes = usePoiStore((s) => s.routes);
  const selectedRoute = usePoiStore((s) => s.selectedRoute);
  const routeFrom = usePoiStore((s) => s.routeFrom);
  const routeTo = usePoiStore((s) => s.routeTo);
  const pickingFrom = usePoiStore((s) => s.pickingFrom);
  const setPickingFrom = usePoiStore((s) => s.setPickingFrom);
  const setPickedPoint = usePoiStore((s) => s.setPickedPoint);


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



  // add sources, layers, and handlers once the map is ready
  useEffect(() => {
    if (!map) return;

    // POIs come from the vector tile route (clustered server-side, filtered by the user's scope)
    map.addSource(POI_SOURCE, {
      type: "vector",
      tiles: [buildTilesUrl(scopeKeyRef.current)],
      minzoom: TILE_MINZOOM,
      maxzoom: TILE_MAXZOOM,
    });

    // cluster circles: bigger circle + different colour for bigger clusters. Hidden from POI_POINTS_MINZOOM up.
    map.addLayer({
      id: CLUSTER_LAYER,
      type: "circle",
      source: POI_SOURCE,
      "source-layer": POI_SOURCE_LAYER,
      maxzoom: POI_POINTS_MINZOOM,
      filter: IS_CLUSTER,
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#1c7ed6", 100, "#7048e8", 1000, "#e8590c"],
        "circle-radius": ["step", ["get", "point_count"], 12, 100, 16, 1000, 20, 10000, 26],
        "circle-opacity": 0.85,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    // count text inside each cluster (maxzoom, NOT minzoom: it must show while clusters show)
    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: "symbol",
      source: POI_SOURCE,
      "source-layer": POI_SOURCE_LAYER,
      maxzoom: POI_POINTS_MINZOOM,
      filter: IS_CLUSTER,
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": GROUP_FONT,
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
    });

    // individual POIs with their category svg. Only drawn from POI_POINTS_MINZOOM up.
    map.addLayer({
      id: POI_LAYER,
      type: "symbol",
      source: POI_SOURCE,
      "source-layer": POI_SOURCE_LAYER,
      minzoom: POI_POINTS_MINZOOM,
      filter: IS_POINT,
      layout: {
        "icon-image": ICON_IMAGE_EXPR,
        // stops must be strictly increasing, so the second stop is POI_POINTS_MINZOOM + 1
        "icon-size": ["interpolate", ["linear"], ["zoom"], POI_POINTS_MINZOOM, 0.7, POI_POINTS_MINZOOM + 1, 1],
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
      minzoom: POI_POINTS_MINZOOM,
      // radius and opacity are animated by the effect further down
      paint: { "circle-color": SELECTED_COLOR, "circle-opacity": 0.4, "circle-radius": 14, "circle-blur": 0.6 },
    });
    map.addLayer({
      id: SELECTED_ICON_LAYER,
      type: "symbol",
      source: SELECTED_SOURCE,
      minzoom: POI_POINTS_MINZOOM,
      layout: {
        "icon-image": ICON_IMAGE_EXPR,
        // about 1.5x the normal icon; the heartbeat effect scales it further
        "icon-size": selectedIconSize(1),
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });

    // maplibre 6: a missing image is supplied by this resolver. It stays pending until the image has been added,
    // and every request for the same icon (several tiles ask at once) waits for the same load.
    // Ids that are not ours (basemap images) are left alone.
    const pending = pendingIcons.current;
    map.setMissingStyleImageResolver(async (imageId: string) => {
      if (!imageId.startsWith(ICON_PREFIX)) return;
      if (map.hasImage(imageId)) return;

      let load = pending.get(imageId);
      if (!load) {
        load = registerCategoryIcon(map, imageId).finally(() => {
          pending.delete(imageId);
        });
        pending.set(imageId, load);
      }
      await load;
    });

    // Hover cursor: maplibre styles its canvas container with `cursor: grab` (and `grabbing` while pressed),
    // so setting canvas.style.cursor is not enough. A class on the container + a !important CSS rule
    // (see the .poi-hover rule in the global stylesheet) always wins, including while the mouse is pressed.
    const container = map.getCanvasContainer();

    // true while a map click is meant to pick a point (radius center or route start):
    // POI / cluster clicks must then be ignored, like in the old version
    const isPicking = () => {
      const s = usePoiStore.getState();
      return s.pickingCenter || s.pickingFrom;
    };

    const onEnter = () => {
      if (isPicking()) return; // keep the crosshair while picking
      container.classList.add("poi-hover");
    };
    const onLeave = () => {
      container.classList.remove("poi-hover");
    };

    // click a cluster: zoom in on it (2 levels per click, never past the zoom where real points show)
    const onClusterClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (isPicking()) return; // the click is picking the radius center / route start

      const feature = e.features?.[0];
      if (!feature) return;
      const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates;
      map.easeTo({
        center: coords ?? e.lngLat,
        zoom: Math.min(map.getZoom() + 2, POI_POINTS_MINZOOM),
        duration: 500,
      });
    };

    // click a POI: the tile only carries a few properties, so fetch the full record by id
    // and hand it to the details window through the store.
    // The abort controller drops an older request when another POI is clicked quickly.
    let detailsAbort: AbortController | null = null;

    const onPoiClick = async (e: maplibregl.MapLayerMouseEvent) => {
      if (activePageRef.current !== POI_PAGE) return;
      if (isPicking()) return; // the click is picking the radius center / route start

      const feature = e.features?.[0];
      if (!feature) return;

      // `id` is a property written by the tile route; fall back to the feature id if the route sets one
      const id = feature.properties?.id ?? feature.id;
      if (id === undefined || id === null) return;

      // position comes from the tile geometry (the details query no longer returns geom)
      const geom = feature.geometry as unknown as { type: string; coordinates: [number, number] };
      const [lng, lat] =
        geom.type === "Point" ? geom.coordinates : [e.lngLat.lng, e.lngLat.lat];

      detailsAbort?.abort();
      detailsAbort = new AbortController();

      try {
        const res = await fetch(POI_DETAILS_URL(id as string | number), {
          signal: detailsAbort.signal,
        });
        if (!res.ok) throw new Error(`POI details failed (${res.status})`);
        const properties = (await res.json()) as PoiProperties;

        usePoiStore.getState().setSelectedPoi({ lng, lat, properties });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.warn("POI details failed:", err instanceof Error ? err.message : err);
      }
    };

    map.on("click", CLUSTER_LAYER, onClusterClick);
    map.on("click", POI_LAYER, onPoiClick);
    map.on("mouseenter", CLUSTER_LAYER, onEnter);
    map.on("mouseleave", CLUSTER_LAYER, onLeave);
    map.on("mouseenter", POI_LAYER, onEnter);
    map.on("mouseleave", POI_LAYER, onLeave);

    return () => {
      try {
        container.classList.remove("poi-hover");
        detailsAbort?.abort();

        map.off("click", CLUSTER_LAYER, onClusterClick);
        map.off("click", POI_LAYER, onPoiClick);
        map.off("mouseenter", CLUSTER_LAYER, onEnter);
        map.off("mouseleave", CLUSTER_LAYER, onLeave);
        map.off("mouseenter", POI_LAYER, onEnter);
        map.off("mouseleave", POI_LAYER, onLeave);

        if (map.getLayer(SELECTED_ICON_LAYER)) map.removeLayer(SELECTED_ICON_LAYER);
        if (map.getLayer(SELECTED_PULSE_LAYER)) map.removeLayer(SELECTED_PULSE_LAYER);
        if (map.getSource(SELECTED_SOURCE)) map.removeSource(SELECTED_SOURCE);
        if (map.getLayer(POI_LAYER)) map.removeLayer(POI_LAYER);
        if (map.getLayer(CLUSTER_COUNT_LAYER)) map.removeLayer(CLUSTER_COUNT_LAYER);
        if (map.getLayer(CLUSTER_LAYER)) map.removeLayer(CLUSTER_LAYER);
        if (map.getSource(POI_SOURCE)) map.removeSource(POI_SOURCE);

        pending.clear();
      } catch {
        // the map was already removed, so there is nothing left to clean up
      }
    };
  }, [map, mapPaneRef]);

  // scope changed (login, logout, different user): point the source at the new tile url.
  // setTiles clears the loaded tiles and requests them again with the new scope.
  // Declared after the effect that adds the source, so the source exists when this first runs.
  useEffect(() => {
    if (!map) return;
    const source = map.getSource(POI_SOURCE) as maplibregl.VectorTileSource | undefined;
    if (!source) return;

    const url = buildTilesUrl(scopeKey);
    if (source.tiles?.[0] === url) return; // already using this scope (first run)
    source.setTiles([url]);
  }, [map, scopeKey]);

  // ----- Directions: sources + layers (declared after the POI layers exist) -----
  // route lines sit under the POI icons, the start/end markers above them
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

  // layer control: show/hide all POI + route layers.
  // Declared after the effects that add the layers, so they exist when this first runs.
  useEffect(() => {
    if (!map) return;
    for (const id of POI_LAYER_IDS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }
  }, [map, visible]);

  


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

    // route lines: selected route on top (blue), alternatives in gray
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    src.setData({
      type: "FeatureCollection",
      features: routes.map((r, i) => ({
        type: "Feature",
        properties: { selected: i === selectedRoute },
        geometry: { type: "LineString", coordinates: r.coordinates },
      })),
    } as unknown as GeoJSONData);
  }, [map, routes, selectedRoute]);

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
