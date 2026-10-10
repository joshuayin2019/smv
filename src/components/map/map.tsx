"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = mapContainer.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      pitch: 60,
      center: [121.06243573632347, 14.586252639496266],
      zoom: 10,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    // Resize and repaint in the same frame so the cleared canvas is never shown
    const ro = new ResizeObserver(() => {
      map.resize();
      map.redraw();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        height: "calc(100vh - 50px)", // 50 = header height
        background: "#e9edf0",
      }}
    />
  );
}