import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
// Adjust this path to wherever theme_colors.ts lives in your project.
import { ACCENT, BORDER, NAVY } from '@/lib/theme_colors';

// [name, longitude, latitude, points of interest]
export type CityPoint = [string, number, number, number];

// Free light basemap with no API key. Swap in your own style URL if you have one.
const STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// MapLibre uses [longitude, latitude] order.
const PH_BOUNDS: [[number, number], [number, number]] = [[116.0, 4.5], [127.0, 21.5]];
const PAN_LIMIT: [[number, number], [number, number]] = [[113.0, 2.0], [130.0, 24.0]];

export default function PhilippinesMap({ cities }: { cities: CityPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const geojson = useMemo(() => {
    const maxCount = Math.max(...cities.map((c) => c[3]));
    return {
      type: 'FeatureCollection' as const,
      features: cities.map(([name, lon, lat, count]) => ({
        type: 'Feature' as const,
        properties: { name, count, top: count === maxCount },
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      })),
    };
  }, [cities]);

  const dataRef = useRef(geojson);
  dataRef.current = geojson;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: PH_BOUNDS,
      fitBoundsOptions: { padding: 10 },
      maxBounds: PAN_LIMIT, // keeps the view on the Philippines
      minZoom: 4,
      maxZoom: 14,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

    map.on('load', () => {
      map.addSource('poi', { type: 'geojson', data: dataRef.current });
      map.addLayer({
        id: 'poi-circles',
        type: 'circle',
        source: 'poi',
        paint: {
          // Dot size grows with the number of points of interest.
          'circle-radius': ['+', 4, ['/', ['sqrt', ['get', 'count']], 30]],
          'circle-color': ['case', ['get', 'top'], ACCENT, NAVY],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      map.on('mousemove', 'poi-circles', (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        map.getCanvas().style.cursor = 'pointer';
        const { name, count } = f.properties as { name: string; count: number };
        popup
          .setLngLat(f.geometry.coordinates as [number, number])
          .setText(`${name}: ${Number(count).toLocaleString('en-PH')} points of interest`)
          .addTo(map);
      });
      map.on('mouseleave', 'poi-circles', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    });

    mapRef.current = map;
    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update the dots when the data changes.
  useEffect(() => {
    const source = mapRef.current?.getSource('poi') as GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson]);

  return (
    <div
      ref={containerRef}
      style={{ height: 440, width: '100%', borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}
    />
  );
}
