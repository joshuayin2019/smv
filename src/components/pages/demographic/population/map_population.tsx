

import { useEffect, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { Paper, Stack, Text } from "@mantine/core";
import { basePath } from "@/lib/config";
import { useMapStore } from "@/stores/map_stores";
import { useGlobalStore } from "@/stores/global_stores";

const SOURCE = "population";
const FILL = "population-fill";
const OUTLINE = "population-outline";
const MIN_ZOOM = 10;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const BANDS = [
  { label: "Below 1,000", color: "#ffffcc" },
  { label: "1,000–4,999", color: "#a1dab4" },
  { label: "5,000–9,999", color: "#41b6c4" },
  { label: "10,000–24,999", color: "#2c7fb8" },
  { label: "25,000+", color: "#253494" },
];
type Properties = { bgy_code: string; layer_name: string; population: number;
  male: number | null; female: number | null };
type ResponseData = { capped: boolean; emptyMessage?: string; map: FeatureCollection<Geometry, Properties> };

export default function PopulationLayer({ visible = true }: { visible?: boolean }) {
  const map = useMapStore((s) => s.map);
  const activePage = useGlobalStore((s) => s.activePage);
  const auth = useGlobalStore((s) => s.auth);
  const enabled = visible && activePage === "Population" && !!auth;
  const [message, setMessage] = useState("Zoom in to view barangay population.");

  useEffect(() => {
    if (!map || !enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let popup: maplibregl.Popup | undefined;
    let generation = 0;
    const previousCursor = map.getCanvas().style.cursor;

    map.addSource(SOURCE, { type: "geojson", data: EMPTY });
    const before = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer({ id: FILL, type: "fill", source: SOURCE, minzoom: MIN_ZOOM,
      paint: { "fill-opacity": 0.65, "fill-color": ["step", ["get", "population"],
        BANDS[0].color, 1000, BANDS[1].color, 5000, BANDS[2].color,
        10000, BANDS[3].color, 25000, BANDS[4].color] } }, before);
    map.addLayer({ id: OUTLINE, type: "line", source: SOURCE, minzoom: MIN_ZOOM,
      paint: { "line-color": "#334155", "line-width": 1, "line-opacity": 0.7 } }, before);
    const source = () => map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;

    const load = async (version: number) => {
      if (disposed || version !== generation) return;
      if (map.getZoom() < MIN_ZOOM) {
        source()?.setData(EMPTY);
        setMessage("Zoom in to level 10 or closer to view barangay population.");
        return;
      }
      const bounds = map.getBounds();
      // Normalize longitude for maps panned into another world copy.
      const west = ((bounds.getWest() + 180) % 360 + 360) % 360 - 180;
      const east = Math.min(180, west + bounds.getEast() - bounds.getWest());
      const bbox = [west, Math.max(-90, bounds.getSouth()), east, Math.min(90, bounds.getNorth())];
      const request = new AbortController();
      controller = request;
      setMessage("Loading population…");
      try {
        const response = await fetch(`${basePath}/api/pages/demographic/population?bbox=${bbox.join(",")}`,
          { signal: request.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403
          ? "No population scope assigned to your account." : `Population request failed (${response.status}).`);
        const data = await response.json() as ResponseData;
        if (disposed || version !== generation) return;
        source()?.setData(data.map);
        setMessage(data.map.features.length === 0
          ? data.emptyMessage ?? "No census records in this view. Try another area."
          : data.capped ? "Showing 500 barangays. Zoom in for complete coverage."
            : `${data.map.features.length.toLocaleString()} barangays in this view. Click an area for details.`);
      } catch (error) {
        if (disposed || version !== generation || request.signal.aborted) return;
        source()?.setData(EMPTY);
        setMessage(error instanceof Error ? error.message : "Unable to load population.");
      }
    };
    const schedule = () => {
      controller?.abort();
      clearTimeout(timer);
      const version = ++generation;
      timer = setTimeout(() => { void load(version); }, 250);
    };
    const click = (event: maplibregl.MapLayerMouseEvent) => {
      const p = event.features?.[0]?.properties;
      if (!p) return;
      const content = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = `${p.layer_name} — Census 2020`;
      content.append(heading);
      for (const [label, value] of [["Population", p.population], ["Male", p.male], ["Female", p.female]]) {
        const row = document.createElement("div");
        row.textContent = `${label}: ${value == null ? "Not available" : Number(value).toLocaleString()}`;
        content.append(row);
      }
      popup?.remove();
      popup = new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map);
    };
    const enter = () => { map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { map.getCanvas().style.cursor = previousCursor; };
    map.on("moveend", schedule);
    map.on("resize", schedule);
    map.on("click", FILL, click);
    map.on("mouseenter", FILL, enter);
    map.on("mouseleave", FILL, leave);
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      popup?.remove();
      map.off("moveend", schedule);
      map.off("resize", schedule);
      map.off("click", FILL, click);
      map.off("mouseenter", FILL, enter);
      map.off("mouseleave", FILL, leave);
      leave();
      if (map.getLayer(OUTLINE)) map.removeLayer(OUTLINE);
      if (map.getLayer(FILL)) map.removeLayer(FILL);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map, enabled, auth]);

  if (!enabled) return null;
  return <Paper pos="absolute" bottom={30} left={10} p="sm" shadow="sm" withBorder
    maw={300} style={{ zIndex: 5 }}>
    <Stack gap={4}>
      <Text size="sm" fw={700}>Population · Census 2020</Text>
      {BANDS.map((band) => <Text key={band.label} size="xs">
        <span style={{ display: "inline-block", width: 12, height: 12,
          background: band.color, border: "1px solid #64748b", marginRight: 6 }} />
        {band.label}
      </Text>)}
      <Text size="xs" c="dimmed" aria-live="polite">{message}</Text>
    </Stack>
  </Paper>;
}
