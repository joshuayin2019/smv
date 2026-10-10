// components/map/map.tsx
import { useEffect, useRef } from 'react';
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default function Map({ active = true }: { active?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [121, 14.6],
      zoom: 5,
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Resize when shown again
  useEffect(() => {
    if (active) requestAnimationFrame(() => mapRef.current?.resize());
  }, [active]);

  // Resize when container size changes (navbar toggle, window resize)
  // 3. Resize when the container size changes (skips 0x0 while hidden)
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        mapRef.current?.resize();
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}