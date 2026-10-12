// components/map/map.tsx
import { useEffect, useRef } from 'react';
import * as maplibregl from "maplibre-gl";
//import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default function Map({ active = true }: { active?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}