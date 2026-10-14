// components/map/map.tsx
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { ErrorEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader, Stack, Text } from "@mantine/core";
import { useMapStore } from "@/stores/map_stores";
import LayerControl from "./layer_control";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default function Map({ active = true }: { active?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const setMap = useMapStore((s) => s.setMap);
  const [zoom, setZoom] = useState("5.0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [121, 14.6],
      zoom: 5,
      trackResize: false,
    });
    mapRef.current = map;

    const updateZoom = () => setZoom(map.getZoom().toFixed(1));
    map.on("zoom", updateZoom);

    map.on("load", () => {
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
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {(loading || error) && (
        <Stack
          align="center"
          justify="center"
          gap="xs"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            background: "var(--mantine-color-gray-0)",
          }}
        >
          {error ? (
            <Text size="sm" c="red">
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

      <LayerControl />


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