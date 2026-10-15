// components/map/map.tsx
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { ErrorEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader, Stack, Text } from "@mantine/core";
import { useMapStore } from "@/stores/map_stores";
import { isWebglSupported } from "@/lib/webgl";
import LayerControl from "./layer_control";
import MapWalk from "./map_walk";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const WEBGL_MESSAGE =
  "Your browser doesn't support WebGL, or it is turned off. Turn on hardware acceleration or update your browser/graphics driver.";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";

// Hide the basemap's own POI icons/labels so only the plain map + buildings remain.
function hideBasemapPois(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];
  for (const layer of layers) {
    const sourceLayer = (layer as any)["source-layer"];
    if (sourceLayer === "poi" || layer.id.startsWith("poi")) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

// Extruded 3D buildings, inserted beneath the first label layer.
function add3dBuildings(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];

  let labelLayerId: string | undefined;
  for (const layer of layers) {
    if (layer.type === "symbol" && (layer.layout as any)?.["text-field"]) {
      labelLayerId = layer.id;
      break;
    }
  }

  if (!map.getSource("openfreemap")) {
    map.addSource("openfreemap", {
      url: "https://tiles.openfreemap.org/planet",
      type: "vector",
    });
  }

  if (map.getLayer("3d-buildings")) return;

  map.addLayer(
    {
      id: "3d-buildings",
      source: "openfreemap",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 15,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["get", "render_height"],
          0,
          "lightgray",
          200,
          "royalblue",
          400,
          "lightblue",
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          ["get", "render_height"],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          ["get", "render_min_height"],
        ],
      },
    },
    labelLayerId
  );
}

export default function Map({ active = true }: { active?: boolean }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const setMap = useMapStore((s) => s.setMap);
  const [zoom, setZoom] = useState("5.0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 1) check WebGL before creating the map
    if (!isWebglSupported()) {
      setError(WEBGL_MESSAGE);
      setLoading(false);
      return;
    }

    // 2) safety net: the constructor throws if the WebGL context can't be created
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [121, 14.6],
        zoom: 5,
        pitch: 45,
        bearing: -17.6,
        maxPitch: 85, // walk mode needs a near-level camera (default limit is 60)
        trackResize: false,
        canvasContextAttributes: { antialias: true },
      });
    } catch (e: any) {
      setError(e?.message ?? WEBGL_MESSAGE);
      setLoading(false);
      return;
    }
    mapRef.current = map;

    // Fullscreen: use the outer wrapper so the layer control, info panel and zoom label
    // stay visible in fullscreen (the default would only fullscreen the map div).
    map.addControl(
      new maplibregl.FullscreenControl({
        container: wrapperRef.current ?? undefined,
      }),
      "top-left"
    );

    // Locate the user: centers the map on their position and keeps tracking.
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
        showAccuracyCircle: true,
        fitBoundsOptions: { maxZoom: 17 },
      }),
      "top-left"
    );

    const updateZoom = () => setZoom(map.getZoom().toFixed(1));
    map.on("zoom", updateZoom);

    map.on("load", () => {
      hideBasemapPois(map);
      add3dBuildings(map);
      updateZoom();
      setMap(map);
      setLoading(false);
    });

    const onError = (e: ErrorEvent) => {
      if (!map.loaded()) {
        setError(e.error?.message ?? "Failed to load map");
        setLoading(false);
      }
    };
    map.on("error", onError);

    const el = containerRef.current;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (el.clientWidth === 0 || el.clientHeight === 0) return;
        map.resize();
        map.redraw();
      });
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.off("zoom", updateZoom);
      map.off("error", onError);
      setMap(null);
      map.remove();
      mapRef.current = null;
    };
  }, [setMap]);

  // inside Map(), after the main useEffect
  useEffect(() => {
    const map = mapRef.current;
    if (!active || !map) return;

    // wait one frame so the wrapper is back to display:block and has a real size
    const id = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      map.resize();
      map.redraw();
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {(loading || error) && (
        <Stack
          align="center"
          justify="center"
          gap="xs"
          px="md"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            background: "var(--mantine-color-gray-0)",
          }}
        >
          {error ? (
            <Text size="sm" c="red" ta="center">
              Couldn't load the map. {error}
            </Text>
          ) : (
            <>
              <Loader size="md" />
              <Text size="sm" c="dimmed">
                Loading map…
              </Text>
            </>
          )}
        </Stack>
      )}

      {/* these need a working map, so hide them when there is none */}
      {!error && <LayerControl />}
      {!error && <MapWalk />}

      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          padding: "2px 8px",
          borderRadius: 4,
          background: "rgba(0, 0, 0, 0.65)",
          color: "#fff",
          fontSize: 12,
          fontFamily: "monospace",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        Zoom: {zoom}
      </div>
    </div>
  );
}