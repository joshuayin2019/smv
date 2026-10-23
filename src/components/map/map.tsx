"use client";

// components/map/map.tsx

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { ErrorEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Loader, Stack, Text } from "@mantine/core";

import { useMapStore } from "@/stores/map_stores";
import { isWebglSupported } from "@/lib/webgl";
import { ACCENT, NAVY_DEEP } from "@/lib/theme_colors";

import LayerControl from "./layer_control";
import MapWalk from "./map_walk";

// ------------------------------------------------------------
// MapLibre worker configuration
// ------------------------------------------------------------

const WORKER_COUNT = 8;

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
maplibregl.setWorkerCount(WORKER_COUNT);

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const WEBGL_MESSAGE =
  "Your browser doesn't support WebGL, or it is turned off. Turn on hardware acceleration or update your browser/graphics driver.";

const MAP_STYLE =
  "https://tiles.openfreemap.org/styles/bright";

const FALLBACK_FONT = "Noto%20Sans%20Regular";

const SUPPORTED_FONTS =
  /fonts\/(Noto%20Sans%20(Regular|Bold|Italic))\//;

// ------------------------------------------------------------
// Performance types
// ------------------------------------------------------------

type PerformanceMetrics = {
  fps: number;
  frameTime: number;
  loadTime: number | null;
  idleTime: number | null;
  zoom: number;
  pitch: number;
  bearing: number;
  renderedFeatures: number;
};

const INITIAL_METRICS: PerformanceMetrics = {
  fps: 0,
  frameTime: 0,
  loadTime: null,
  idleTime: null,
  zoom: 6,
  pitch: 0,
  bearing: 0,
  renderedFeatures: 0,
};

// ------------------------------------------------------------
// Control styles
// ------------------------------------------------------------

const CONTROL_CSS = `
  .maplibregl-map .maplibregl-ctrl-top-right {
    top: 44px;
  }

  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl {
    margin: 8px 10px 0 0;
  }

  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl-group {
    box-sizing: border-box;
    width: 34px;
    height: 34px;
    background: ${NAVY_DEEP};
    border-radius: 8px;
    border-top: 3px solid ${ACCENT};
    box-shadow: 0 10px 15px -5px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl-group button {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0;
    background-color: transparent;
  }

  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl-group button:not(:disabled):hover {
    background-color: rgba(255, 255, 255, 0.12);
  }

  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl-icon {
    filter: brightness(0) invert(1);
    background-position: center;
  }

  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl-geolocate-active,
  .maplibregl-map .maplibregl-ctrl-top-right .maplibregl-ctrl-geolocate-active-error {
    background-color: rgba(0, 204, 10, 0.3) !important;
  }
`;

// ------------------------------------------------------------
// Hide basemap POIs
// ------------------------------------------------------------

function hideBasemapPois(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    const sourceLayer = (
      layer as maplibregl.LayerSpecification & {
        "source-layer"?: string;
      }
    )["source-layer"];

    if (
      sourceLayer === "poi" ||
      layer.id.startsWith("poi")
    ) {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        "none"
      );
    }
  }
}

// ------------------------------------------------------------
// Hide basemap boundaries
// ------------------------------------------------------------

function hideBasemapBoundaries(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    const sourceLayer = (
      layer as maplibregl.LayerSpecification & {
        "source-layer"?: string;
      }
    )["source-layer"];

    const isBoundaryLine =
      sourceLayer === "boundary" ||
      layer.id.startsWith("boundary");

    const isAdminLabel =
      sourceLayer === "place" &&
      /country|state|region|province/i.test(layer.id);

    if (isBoundaryLine || isAdminLabel) {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        "none"
      );
    }
  }
}

// ------------------------------------------------------------
// Remove problematic shield layers
// ------------------------------------------------------------

function removeBrokenShieldLayers(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    if (
      /shield/i.test(layer.id) &&
      map.getLayer(layer.id)
    ) {
      map.removeLayer(layer.id);
    }
  }
}

// ------------------------------------------------------------
// 3D Buildings
// ------------------------------------------------------------

function add3dBuildings(map: maplibregl.Map) {
  const layers = map.getStyle().layers ?? [];

  let labelLayerId: string | undefined;

  for (const layer of layers) {
    if (
      layer.type === "symbol" &&
      layer.layout?.["text-field"]
    ) {
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
      minzoom: 17,

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

// ------------------------------------------------------------
// Performance panel
// ------------------------------------------------------------

type PerformancePanelProps = {
  metrics: PerformanceMetrics;
  visible: boolean;
  onToggle: () => void;
};

function PerformancePanel({
  metrics,
  visible,
  onToggle,
}: PerformancePanelProps) {
  const fpsColor =
    metrics.fps >= 50
      ? "#00e676"
      : metrics.fps >= 25
        ? "#ffca28"
        : "#ff7043";

  const rows = [
    {
      label: "FPS",
      value: String(metrics.fps),
      color: fpsColor,
    },
    {
      label: "Frame Time",
      value: `${metrics.frameTime.toFixed(2)} ms`,
    },
    {
      label: "Map Load",
      value:
        metrics.loadTime === null
          ? "Loading..."
          : `${metrics.loadTime} ms`,
    },
    {
      label: "Map Idle",
      value:
        metrics.idleTime === null
          ? "Waiting..."
          : `${metrics.idleTime} ms`,
    },
    {
      label: "Zoom",
      value: metrics.zoom.toFixed(2),
    },
    {
      label: "Pitch",
      value: `${metrics.pitch.toFixed(1)}°`,
    },
    {
      label: "Bearing",
      value: `${metrics.bearing.toFixed(1)}°`,
    },
    {
      label: "Workers",
      value: String(WORKER_COUNT),
    },
    {
      label: "Rendered Features",
      value: metrics.renderedFeatures.toLocaleString(),
    },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 10,
        minWidth: 215,
        maxWidth: 260,
        background: "rgba(5, 15, 40, 0.9)",
        color: "#fff",
        borderRadius: 8,
        borderTop: `3px solid ${ACCENT}`,
        boxShadow: "0 5px 18px rgba(0,0,0,0.3)",
        fontFamily: "monospace",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 12px",
          background: "transparent",
          border: 0,
          color: "#00e676",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          textAlign: "left",
        }}
      >
        <span>Performance Metrics</span>
        <span>{visible ? "−" : "+"}</span>
      </button>

      {visible && (
        <div
          style={{
            padding: "0 12px 12px",
            display: "grid",
            gap: 7,
          }}
        >
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span style={{ color: "#aebbd0" }}>
                {row.label}
              </span>

              <span
                style={{
                  fontWeight: 600,
                  color: row.color ?? "#fff",
                  whiteSpace: "nowrap",
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Main Map Component
// ------------------------------------------------------------

export default function Map({
  active = true,
}: {
  active?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const setMap = useMapStore((s) => s.setMap);

  const [zoom, setZoom] = useState("6.0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] =
    useState<PerformanceMetrics>(INITIAL_METRICS);

  const [showMetrics, setShowMetrics] = useState(true);

  // ----------------------------------------------------------
  // Create MapLibre map
  // ----------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!isWebglSupported()) {
      setError(WEBGL_MESSAGE);
      setLoading(false);
      return;
    }

    const createdAt = performance.now();

    let map: maplibregl.Map;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,

        center: [121, 14.6],
        zoom: 6,
        minZoom: 6,

        trackResize: false,
        maxPitch: 85, 
        canvasContextAttributes: {
          antialias: true,
        },

        transformRequest: (url, resourceType) => {
          if (
            resourceType === "Glyphs" &&
            url.startsWith(
              "https://tiles.openfreemap.org/fonts/"
            ) &&
            !SUPPORTED_FONTS.test(url)
          ) {
            return {
              url: url.replace(
                /fonts\/[^/]+\//,
                `fonts/${FALLBACK_FONT}/`
              ),
            };
          }

          return undefined;
        },
      });
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : WEBGL_MESSAGE
      );
      setLoading(false);
      return;
    }

    mapRef.current = map;

    // --------------------------------------------------------
    // Fullscreen
    // --------------------------------------------------------

    map.addControl(
      new maplibregl.FullscreenControl({
        container: wrapperRef.current ?? undefined,
      }),
      "top-right"
    );

    // --------------------------------------------------------
    // Geolocation
    // --------------------------------------------------------

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },

        trackUserLocation: true,
        showUserLocation: true,
        showAccuracyCircle: true,

        fitBoundsOptions: {
          maxZoom: 17,
        },
      }),
      "top-right"
    );

    // --------------------------------------------------------
    // Performance tracking
    // --------------------------------------------------------

    let frameCount = 0;
    let fpsStart = performance.now();
    let lastRenderAt = fpsStart;
    let lastFrameAt = 0;
    let frameDurationSum = 0;
    let frameDurationCount = 0;
    let lastMetricsUpdate = 0;

    const updateCamera = () => {
      const currentZoom = map.getZoom();

      setZoom(currentZoom.toFixed(1));

      setMetrics((previous) => ({
        ...previous,
        zoom: currentZoom,
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      }));
    };

    // Count actual MapLibre render events.
    const onRender = () => {
      const now = performance.now();

      frameCount++;
      lastRenderAt = now;

      if (lastFrameAt > 0) {
        const duration = now - lastFrameAt;

        if (duration > 0 && duration < 1000) {
          frameDurationSum += duration;
          frameDurationCount++;
        }
      }

      lastFrameAt = now;

      const elapsed = now - fpsStart;

      if (elapsed >= 1000) {
        const currentFps = Math.round(
          (frameCount * 1000) / elapsed
        );

        const averageFrameTime =
          frameDurationCount > 0
            ? frameDurationSum / frameDurationCount
            : 0;

        setMetrics((previous) => ({
          ...previous,
          fps: currentFps,
          frameTime: averageFrameTime,
        }));

        frameCount = 0;
        fpsStart = now;
        frameDurationSum = 0;
        frameDurationCount = 0;
      }
    };

    // Avoid repeatedly counting rendered features on every frame.
    const updateRenderedFeatures = () => {
      const now = performance.now();

      if (now - lastMetricsUpdate < 1000) return;

      lastMetricsUpdate = now;

      try {
        const features = map.queryRenderedFeatures();

        setMetrics((previous) => ({
          ...previous,
          renderedFeatures: features.length,
        }));
      } catch {
        // Style may still be loading.
      }
    };

    const onRenderWithMetrics = () => {
      onRender();
      updateRenderedFeatures();
    };

    map.on("render", onRenderWithMetrics);

    map.on("zoom", updateCamera);
    map.on("pitch", updateCamera);
    map.on("rotate", updateCamera);

    // Display zero FPS when the map is no longer rendering.
    const fpsInterval = window.setInterval(() => {
      if (performance.now() - lastRenderAt > 1500) {
        setMetrics((previous) => {
          if (
            previous.fps === 0 &&
            previous.frameTime === 0
          ) {
            return previous;
          }

          return {
            ...previous,
            fps: 0,
            frameTime: 0,
          };
        });

        frameCount = 0;
        frameDurationSum = 0;
        frameDurationCount = 0;
        lastFrameAt = 0;
        fpsStart = performance.now();
      }
    }, 500);

    // --------------------------------------------------------
    // Map load event
    // --------------------------------------------------------

    const onLoad = () => {
      removeBrokenShieldLayers(map);
      hideBasemapPois(map);
      hideBasemapBoundaries(map);
      add3dBuildings(map);

      const elapsed = Math.round(
        performance.now() - createdAt
      );

      setMetrics((previous) => ({
        ...previous,
        loadTime: elapsed,
      }));

      updateCamera();

      setMap(map);
      setLoading(false);
    };

    map.on("load", onLoad);

    // --------------------------------------------------------
    // Initial idle time
    // --------------------------------------------------------

    const onInitialIdle = () => {
      const elapsed = Math.round(
        performance.now() - createdAt
      );

      setMetrics((previous) => ({
        ...previous,
        idleTime: elapsed,
      }));
    };

    map.once("idle", onInitialIdle);

    // --------------------------------------------------------
    // Map errors
    // --------------------------------------------------------

    const onError = (e: ErrorEvent) => {
      if (!map.loaded()) {
        setError(
          e.error?.message ?? "Failed to load map"
        );

        setLoading(false);
      }
    };

    map.on("error", onError);

    // --------------------------------------------------------
    // Resize observer
    // --------------------------------------------------------

    const el = containerRef.current;

    let raf = 0;

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);

      raf = requestAnimationFrame(() => {
        if (
          el.clientWidth === 0 ||
          el.clientHeight === 0
        ) {
          return;
        }

        map.resize();
        map.redraw();
      });
    });

    ro.observe(el);

    // --------------------------------------------------------
    // Cleanup
    // --------------------------------------------------------

    return () => {
      cancelAnimationFrame(raf);

      ro.disconnect();

      window.clearInterval(fpsInterval);

      map.off("render", onRenderWithMetrics);

      map.off("zoom", updateCamera);
      map.off("pitch", updateCamera);
      map.off("rotate", updateCamera);

      map.off("load", onLoad);
      map.off("idle", onInitialIdle);
      map.off("error", onError);

      setMap(null);

      map.remove();

      mapRef.current = null;
    };
  }, [setMap]);

  // ----------------------------------------------------------
  // Resize when active
  // ----------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;

    if (!active || !map) return;

    const id = requestAnimationFrame(() => {
      const el = containerRef.current;

      if (
        !el ||
        el.clientWidth === 0 ||
        el.clientHeight === 0
      ) {
        return;
      }

      map.resize();
      map.redraw();
    });

    return () => cancelAnimationFrame(id);
  }, [active]);

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      <style>{CONTROL_CSS}</style>

      {/* MapLibre container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />

      {/* Loading and error overlay */}
      {(loading || error) && (
        <Stack
          align="center"
          justify="center"
          gap="xs"
          px="md"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
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

      {/* Existing map controls */}
      {!error && <LayerControl />}
      {!error && <MapWalk />}

      {/* Performance Metrics */}
      {!error && (
        <PerformancePanel
          metrics={metrics}
          visible={showMetrics}
          onToggle={() =>
            setShowMetrics((previous) => !previous)
          }
        />
      )}

      {/* Existing zoom indicator */}
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