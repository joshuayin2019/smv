// components/map/map.tsx  (basic map only)
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map_stores";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default function Map({ active = true }: { active?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const setMap = useMapStore((s) => s.setMap);
  const [zoom, setZoom] = useState("5.0"); // matches the initial zoom below

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [121, 14.6],
      zoom: 5,
      // Disable the built-in resize handler; we do our own below
      trackResize: false,
    });
    mapRef.current = map;

    // keep the badge in sync; one decimal is enough, and an unchanged string doesn't re-render
    const updateZoom = () => setZoom(map.getZoom().toFixed(1));
    map.on("zoom", updateZoom);

    // share the map only after the style is ready, so layers can be added safely
    map.on("load", () => {
      updateZoom();
      setMap(map);
    });

    const el = containerRef.current;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Skip while hidden (display:none gives 0x0) to avoid blanking the canvas
        if (el.clientWidth === 0 || el.clientHeight === 0) return;
        map.resize();
        map.redraw(); // synchronous repaint -> no blank frame
      });
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.off("zoom", updateZoom);
      setMap(null);
      map.remove();
      mapRef.current = null;
    };
  }, [setMap]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* zoom level badge */}
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
          pointerEvents: "none", // never blocks clicks on the map
          zIndex: 1,
        }}
      >
        Zoom: {zoom}
      </div>
    </div>
  );
}