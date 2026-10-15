// lib/basemap.ts
import type { Map as MlMap } from "maplibre-gl";

export type Basemap = "streets" | "satellite";

const SAT_SOURCE = "satellite-imagery";
const SAT_LAYER = "satellite-imagery";

// Esri World Imagery (free for normal app use, attribution required).
// To use another provider, swap this URL and the attribution / maxzoom below.
const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
const SATELLITE_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

// Basemap layer types that would cover the imagery. Symbol (label) layers are kept on purpose,
// so street names stay on top of the imagery and the POI hiding is left untouched.
const COVERING_TYPES = new Set(["background", "fill", "line", "fill-extrusion", "hillshade", "raster"]);

// Original visibility of each covering layer, so switching back restores the style exactly
const baseLayers = new WeakMap<MlMap, { id: string; visibility: string }[]>();

// Lazy: nothing is added to the map until Satellite is chosen for the first time
function ensureSatellite(map: MlMap): boolean {
  if (baseLayers.has(map)) return !!map.getLayer(SAT_LAYER);

  const layers = map.getStyle()?.layers ?? [];
  if (!layers.length) return false;

  // The basemap's own vector source = the source used by the first layer that has one.
  // This keeps our own layers (3d-buildings, smv, poi...) out of the hide/show list.
  const baseSource = layers.find((l) => "source" in l)?.source;

  baseLayers.set(
    map,
    layers
      .filter(
        (l) =>
          COVERING_TYPES.has(l.type) &&
          (l.type === "background" || ("source" in l && l.source === baseSource))
      )
      .map((l) => ({
        id: l.id,
        visibility: (map.getLayoutProperty(l.id, "visibility") as string | undefined) ?? "visible",
      }))
  );

  map.addSource(SAT_SOURCE, {
    type: "raster",
    tiles: SATELLITE_TILES,
    tileSize: 256,
    maxzoom: 19,
    attribution: SATELLITE_ATTRIBUTION,
  });

  // Very bottom of the stack, so everything else draws on top of it
  map.addLayer(
    {
      id: SAT_LAYER,
      type: "raster",
      source: SAT_SOURCE,
      layout: { visibility: "none" },
      paint: { "raster-fade-duration": 0 },
    },
    layers[0].id
  );
  return true;
}

export function setBasemap(map: MlMap, basemap: Basemap) {
  const sat = basemap === "satellite";

  // Default basemap and nothing was ever changed: do nothing at all
  if (!sat && !baseLayers.has(map)) return;
  if (!ensureSatellite(map)) return;

  map.setLayoutProperty(SAT_LAYER, "visibility", sat ? "visible" : "none");

  for (const b of baseLayers.get(map) ?? []) {
    if (!map.getLayer(b.id)) continue;
    map.setLayoutProperty(b.id, "visibility", sat ? "none" : (b.visibility as "visible" | "none"));
  }
}
