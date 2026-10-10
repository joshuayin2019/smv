'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from "maplibre-gl";
import 'maplibre-gl/dist/maplibre-gl.css';
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      pitch: 60,
      center: [121.06243573632347, 14.586252639496266],
      zoom: 10,
    });
    mapRef.current = map;

    // Resize the canvas whenever the container changes size
    // (covers the AppShell navbar transition, not just window resizes)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 'calc(100vh - 50px)' }} // 50 = header height
    />
  );
}