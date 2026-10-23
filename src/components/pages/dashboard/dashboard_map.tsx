'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ActionIcon, Box, Group, Indicator, Popover, Radio, Stack, Text, Tooltip } from '@mantine/core';
import { IconFocus2, IconStack2 } from '@tabler/icons-react';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config';

const SOURCE = 'dashboard-areas';
const FILL = 'dashboard-area-fill';
const LINE = 'dashboard-area-line';
const PH_BOUNDS: maplibregl.LngLatBoundsLike = [[116, 4.5], [127, 21.5]];

export default function DashboardMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const auth = useGlobalStore(s => s.auth);
  const setPage = useGlobalStore(s => s.setActivePage);
  const [mode, setMode] = useState('population');
  const scope = mode === 'poi' ? auth?.scope_poi : auth?.scope_psa;
  const scopeKey = JSON.stringify(scope ?? []);
  const [home, setHome] = useState<{ key: string; bounds: maplibregl.LngLatBoundsLike } | null>(null);
  // Readiness belongs to one map instance. A boolean can remain true while
  // React recreates the map during development or Fast Refresh.
  const [loadedMap, setLoadedMap] = useState<maplibregl.Map | null>(null);
  const ready = loadedMap !== null && loadedMap === mapRef.current;
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading map…');

  useEffect(() => {
    if (!container.current) return;
    setLoadedMap(null);
    setError('');
    setStatus('Loading map…');
    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current,
        style: 'https://tiles.openfreemap.org/styles/bright', bounds: PH_BOUNDS,
        fitBoundsOptions: { padding: 30 }, maxZoom: 19, minZoom: 3,
        scrollZoom: true, trackResize: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        canvasContextAttributes: { antialias: false }, attributionControl: { compact: true },
      });
    } catch {
      setError('The map requires WebGL and browser hardware acceleration.');
      return;
    }
    mapRef.current = map;
    let disposed = false;
    const onLoad = () => { if (!disposed) { setLoadedMap(map); setStatus(''); } };
    const onError = () => { if (!disposed) setStatus('Some map tiles could not load. Try moving or zooming the map.'); };
    const onIdle = () => { if (!disposed) setStatus(''); };
    map.on('load', onLoad);
    map.on('error', onError);
    map.on('idle', onIdle);
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      const canvas = map.getCanvas(); canvas.style.width = '100%'; canvas.style.height = '100%';
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed && container.current?.clientWidth && container.current?.clientHeight) map.resize();
      }, 120);
    });
    observer.observe(container.current);
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      map.off('load', onLoad); map.off('error', onError); map.off('idle', onIdle);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadedMap !== map) return;
    const style = map.getStyle();
    if (!style) return;
    for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    if (!JSON.parse(scopeKey).length) return;
    const places = mode === 'poi';
    const firstLabel = style.layers?.find(layer => layer.type === 'symbol')?.id;
    const params = new URLSearchParams({ scope: scopeKey, level: 'municipality' });
    map.addSource(SOURCE, { type: 'vector', minzoom: places ? 5 : 3, maxzoom: places ? 17 : 14,
      tiles: [`${window.location.origin}${basePath}/api/pages/${places ? 'poi' : 'demographic/population'}/tiles/{z}/{x}/{y}?${params}`],
    });
    if (places) {
      map.addLayer({ id: FILL, type: 'circle', source: SOURCE, 'source-layer': 'poi',
        paint: {
          'circle-color': ['step', ['to-number', ['get', 'point_count'], 1], '#079688', 100, '#2458bd', 1000, '#9053c7'],
          'circle-radius': ['step', ['to-number', ['get', 'point_count'], 1], 7, 10, 11, 100, 15, 1000, 20],
          'circle-opacity': 0.88, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
        } });
      map.addLayer({ id: LINE, type: 'symbol', source: SOURCE, 'source-layer': 'poi', filter: ['has', 'point_count'],
        layout: { 'text-field': ['to-string', ['get', 'point_count_abbreviated']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' } });
    } else {
    map.addLayer({ id: FILL, type: 'fill', source: SOURCE, 'source-layer': mode,
      minzoom: 3,
      paint: { 'fill-opacity': 0.55,
        'fill-color': ['step', ['to-number', ['get', 'population'], 0], '#ffffcc', 25000, '#c7e9b4', 50000, '#7fcdbb', 100000, '#41b6c4', 250000, '#2c7fb8', 500000, '#253494'],
      },
    }, firstLabel);
    map.addLayer({ id: LINE, type: 'line', source: SOURCE, 'source-layer': mode, minzoom: 3,
      paint: { 'line-color': '#163f78', 'line-width': 1.5, 'line-opacity': 0.85 } }, firstLabel);
    }
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    const hover = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      const value = places ? (props.point_count != null ? `${Number(props.point_count).toLocaleString('en-PH')} places · click to zoom` : String(props.category ?? 'Point of interest'))
        : `${Number(props.population ?? 0).toLocaleString('en-PH')} people`;
      popup.setLngLat(event.lngLat).setText(`${props.name ?? (places ? 'POI cluster' : 'Area')} · ${value}`).addTo(map);
      popup.getElement().style.pointerEvents = 'none';
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => { popup.remove(); map.getCanvas().style.cursor = ''; };
    const click = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (places && feature?.properties.point_count != null) {
        map.easeTo({ center: event.lngLat, zoom: Math.min(17, map.getZoom() + 2), duration: 500 });
      } else setPage(places ? 'Point of Interest' : 'Population');
    };
    map.on('mousemove', FILL, hover); map.on('mouseleave', FILL, leave); map.on('click', FILL, click);
    return () => { leave(); map.off('mousemove', FILL, hover); map.off('mouseleave', FILL, leave); map.off('click', FILL, click); };
  }, [loadedMap, mode, scopeKey, setPage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadedMap !== map || !JSON.parse(scopeKey).length) return;
    const ctrl = new AbortController();
    fetch(`${basePath}/api/pages/demographic/population/extent?${new URLSearchParams({ scope: scopeKey })}`, { signal: ctrl.signal })
      .then(async result => { if (!result.ok) throw new Error('Extent unavailable'); return result.json(); })
      .then((bbox: number[] | null) => {
        if (!ctrl.signal.aborted && mapRef.current === map && bbox?.length === 4 && bbox.every(Number.isFinite)) {
          const bounds: maplibregl.LngLatBoundsLike = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
          setHome({ key: scopeKey, bounds });
          map.fitBounds(bounds, { padding: 35, maxZoom: 12, duration: 700 });
        }
      }).catch(() => {});
    return () => ctrl.abort();
    }, [loadedMap, scopeKey]);

  return <Box>
      <Box pos="relative" h={385} style={{ overflow: 'hidden', borderRadius: 10, background: '#eaf0f7' }}>
        <div ref={container} style={{ height: '100%', width: '100%' }} />
        <Box pos="absolute" top={10} left={10} style={{ zIndex: 2 }}>
          <Popover position="bottom-start" shadow="md" width={205}>
            <Popover.Target>
              <Tooltip label={`Layers · ${mode === 'poi' ? 'Points of interest' : 'Population'}`} position="right">
                <Indicator size={34} position="middle-center" offset={0} color="white"
                  label={<IconStack2 size={19} />} role="button" tabIndex={0}
                  aria-label={`Choose map layer, currently ${mode === 'poi' ? 'Points of interest' : 'Population'}`}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
                  }}
                  styles={{ root: { cursor: 'pointer' }, indicator: { color: '#163f78', borderRadius: 8, boxShadow: '0 1px 5px #0002', pointerEvents: 'none' } }}>
                  <Box w={34} h={34} />
                </Indicator>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="xs" fw={700} mb="sm">Map layer</Text>
              <Radio.Group value={mode} onChange={setMode} aria-label="Dashboard map layer">
                <Stack gap="sm">
                  <Radio size="xs" value="population" label="Population" />
                  <Radio size="xs" value="poi" label="Points of interest" />
                </Stack>
              </Radio.Group>
            </Popover.Dropdown>
          </Popover>
        </Box>
        <Box pos="absolute" top={10} right={10} style={{ zIndex: 2 }}>
          <Tooltip label="Back to assigned extent">
            <ActionIcon size="lg" variant="white" color="#163f78" aria-label="Back to assigned extent"
              disabled={!ready || (!!scope?.length && home?.key !== scopeKey)}
              onClick={() => mapRef.current?.fitBounds(home?.key === scopeKey ? home.bounds : PH_BOUNDS, { padding: 35, maxZoom: 12, duration: 700 })}>
              <IconFocus2 size={19} />
            </ActionIcon>
          </Tooltip>
        </Box>
        {(error || status) && <Box pos="absolute" top={52} left={10} maw={250} bg="white" p="xs" style={{ borderRadius: 6 }}><Text size="xs">{error || status}</Text></Box>}
        {!scope?.length && <Box pos="absolute" bottom={60} left={12} bg="white" p="xs"><Text size="xs">No {mode === 'poi' ? 'POI' : 'demographic'} scope assigned.</Text></Box>}
        <Box pos="absolute" bottom={26} left={12} p={8} bg="#fffffff0" style={{ borderRadius: 6, pointerEvents: 'none' }}>
          {mode === 'poi' ? <Group gap={8}>{[{ label: '1–99', color: '#079688' }, { label: '100–999', color: '#2458bd' }, { label: '1,000+', color: '#9053c7' }].map(item => <Group key={item.label} gap={4}><Box w={9} h={9} bg={item.color} style={{ borderRadius: '50%' }} /><Text fz={10}>{item.label}</Text></Group>)}<Text fz={10}>Places per cluster · zoom 5+</Text></Group>
            : <Group gap={7}><Text fz={10}>Lower</Text>{['#ffffcc','#c7e9b4','#7fcdbb','#41b6c4','#2c7fb8','#253494'].map(color => <Box key={color} w={14} h={8} bg={color} />)}<Text fz={10}>Higher population</Text></Group>}
        </Box>
      </Box>
      <Text fz={10} c="dimmed" mt={8}>Scroll to zoom · drag to pan · hover to inspect</Text>
    </Box>;
}
