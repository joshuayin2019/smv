'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Group, SegmentedControl, Text } from '@mantine/core';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config';

const SOURCE = 'dashboard-areas';
const FILL = 'dashboard-area-fill';
const LINE = 'dashboard-area-line';
const PH_BOUNDS: maplibregl.LngLatBoundsLike = [[116, 4.5], [127, 21.5]];

export default function DashboardMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const scope = useGlobalStore(s => s.auth?.scope_psa);
  const scopeKey = JSON.stringify(scope ?? []);
  const setPage = useGlobalStore(s => s.setActivePage);
  const [mode, setMode] = useState('population');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading map…');

  useEffect(() => {
    if (!container.current) return;
    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current,
        style: 'https://tiles.openfreemap.org/styles/bright', bounds: PH_BOUNDS,
        fitBoundsOptions: { padding: 30 }, maxZoom: 16, minZoom: 3,
        scrollZoom: false, trackResize: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        canvasContextAttributes: { antialias: false }, attributionControl: { compact: true },
      });
    } catch {
      setError('The map requires WebGL and browser hardware acceleration.');
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { setReady(true); setStatus(''); });
    map.on('error', () => setStatus('Some map tiles could not load. Try moving or zooming the map.'));
    map.on('idle', () => setStatus(''));
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      const canvas = map.getCanvas(); canvas.style.width = '100%'; canvas.style.height = '100%';
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (container.current?.clientWidth && container.current?.clientHeight) map.resize();
      }, 120);
    });
    observer.observe(container.current);
    return () => { clearTimeout(timer); observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    if (!JSON.parse(scopeKey).length) return;
    const classification = mode === 'barangay_class';
    const firstLabel = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    const params = new URLSearchParams({ scope: scopeKey, level: classification ? 'barangay' : 'municipality' });
    map.addSource(SOURCE, { type: 'vector', minzoom: 3, maxzoom: 14,
      tiles: [`${window.location.origin}${basePath}/api/pages/demographic/${mode}/tiles/{z}/{x}/{y}?${params}`],
    });
    map.addLayer({ id: FILL, type: 'fill', source: SOURCE, 'source-layer': mode,
      minzoom: classification ? 8 : 3,
      paint: { 'fill-opacity': classification ? 0.5 : 0.55,
        'fill-color': classification ? ['match', ['get', 'urban_rural'], 'U', '#c000db', 'R', '#00c98b', '#94a3b8']
          : ['step', ['to-number', ['get', 'population'], 0], '#ffffcc', 25000, '#c7e9b4', 50000, '#7fcdbb', 100000, '#41b6c4', 250000, '#2c7fb8', 500000, '#253494'],
      },
    }, firstLabel);
    map.addLayer({ id: LINE, type: 'line', source: SOURCE, 'source-layer': mode, minzoom: classification ? 8 : 3,
      paint: { 'line-color': '#163f78', 'line-width': 1.5, 'line-opacity': 0.85 } }, firstLabel);
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    const hover = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      const value = classification ? (props.urban_rural === 'U' ? 'Urban' : props.urban_rural === 'R' ? 'Rural' : 'Unknown')
        : `${Number(props.population ?? 0).toLocaleString('en-PH')} people`;
      popup.setLngLat(event.lngLat).setText(`${props.name} · ${value}`).addTo(map);
      popup.getElement().style.pointerEvents = 'none';
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => { popup.remove(); map.getCanvas().style.cursor = ''; };
    const click = () => setPage(classification ? 'Barangay Class' : 'Population');
    map.on('mousemove', FILL, hover); map.on('mouseleave', FILL, leave); map.on('click', FILL, click);
    return () => { leave(); map.off('mousemove', FILL, hover); map.off('mouseleave', FILL, leave); map.off('click', FILL, click); };
  }, [ready, mode, scopeKey, setPage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !JSON.parse(scopeKey).length) return;
    const ctrl = new AbortController();
    fetch(`${basePath}/api/pages/demographic/population/extent?${new URLSearchParams({ scope: scopeKey })}`, { signal: ctrl.signal })
      .then(async result => { if (!result.ok) throw new Error('Extent unavailable'); return result.json(); })
      .then((bbox: number[] | null) => {
        if (!ctrl.signal.aborted && bbox?.length === 4 && bbox.every(Number.isFinite)) {
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 35, maxZoom: 12, duration: 700 });
        }
      }).catch(() => {});
    return () => ctrl.abort();
  }, [ready, scopeKey]);

  return <Box>
      <Group justify="space-between" gap="xs" mb="sm"><SegmentedControl size="xs" value={mode} onChange={setMode} data={[{ value: 'population', label: 'Population' }, { value: 'barangay_class', label: 'Barangay class' }]} />
        <Text fz={10} c="dimmed">Hover to inspect · click to explore</Text></Group>
      <Box pos="relative" h={385} style={{ overflow: 'hidden', borderRadius: 10, background: '#eaf0f7' }}>
        <div ref={container} style={{ height: '100%', width: '100%' }} />
        {(error || status) && <Box pos="absolute" top={10} left={10} maw={250} bg="white" p="xs" style={{ borderRadius: 6 }}><Text size="xs">{error || status}</Text></Box>}
        {!scope?.length && <Box pos="absolute" bottom={30} left={12} bg="white" p="xs"><Text size="xs">No demographic scope assigned.</Text></Box>}
        <Box pos="absolute" bottom={26} left={12} p={8} bg="#fffffff0" style={{ borderRadius: 6, pointerEvents: 'none' }}>
          {mode === 'barangay_class' ? <Group gap={8}>{[{ label: 'Urban', color: '#c000db' }, { label: 'Rural', color: '#00c98b' }, { label: 'Unknown', color: '#94a3b8' }].map(item => <Group key={item.label} gap={4}><Box w={8} h={8} bg={item.color} /><Text fz={10}>{item.label}</Text></Group>)}<Text fz={10}>Zoom 8+</Text></Group>
            : <Group gap={7}><Text fz={10}>Lower</Text>{['#ffffcc','#c7e9b4','#7fcdbb','#41b6c4','#2c7fb8','#253494'].map(color => <Box key={color} w={14} h={8} bg={color} />)}<Text fz={10}>Higher population</Text></Group>}
        </Box>
      </Box>
    </Box>;
}
