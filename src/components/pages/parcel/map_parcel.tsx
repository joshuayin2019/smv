import { useEffect, useState } from 'react';
import type { ExpressionSpecification, MapLayerMouseEvent } from 'maplibre-gl';
import { Alert } from '@mantine/core';
import { useMapStore } from '@/stores/map_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { useParcelStore } from '@/stores/parcel_stores';
import { PARCEL_CLASSES } from '@/lib/pages/parcel/parcel_types';
import { basePath } from '@/lib/config';

const SOURCE = 'parcel-data', FILL = 'parcel-fill', LINE = 'parcel-line', SELECTED = 'parcel-selected';

export default function ParcelLayer() {
  const map = useMapStore(s => s.map);
  const parcel = useMapStore(s => s.parcel);
  const active = useGlobalStore(s => s.activePage === 'Parcels');
  const scopes = JSON.stringify(useGlobalStore(s => s.auth?.scope_parcel) ?? []);
  const { search, classification, selected, select, revision } = useParcelStore();
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(0);
  useEffect(() => {
    if (!map || !active) return;
    let disposed = false;
    const ctrl = new AbortController();
    let selectionRequest = 0;
    setError('');
    const updateZoom = () => setZoom(map.getZoom());
    updateZoom();
    const click = async (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (!id) return;
      const request = ++selectionRequest;
      try {
        const response = await fetch(`${basePath}/api/pages/parcel?id=${encodeURIComponent(id)}`, { signal: ctrl.signal });
        if (!response.ok) throw new Error('Unable to load parcel details.');
        const row = await response.json();
        if (!disposed && request === selectionRequest) select(row);
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load parcel.'); }
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    const tileError = (e: unknown) => { if ((e as { sourceId?: string }).sourceId === SOURCE) setError('Unable to load parcel map tiles. Use Refresh to retry.'); };
    const install = () => {
      if (disposed || !map.isStyleLoaded() || map.getSource(SOURCE)) return;
      const params = new URLSearchParams({ search, classification, revision: String(revision), scopeKey: scopes });
      map.addSource(SOURCE, { type: 'vector', minzoom: 12, maxzoom: 18,
        tiles: [`${window.location.origin}${basePath}/api/pages/parcel/tiles/{z}/{x}/{y}?${params}`] });
      const color = ['match', ['get','classification'],
        ...PARCEL_CLASSES.flatMap(c => [c.name.toLowerCase(),c.color]), '#94a3b8'] as unknown as ExpressionSpecification;
      map.addLayer({ id: FILL, type: 'fill', source: SOURCE, 'source-layer': 'parcel',
        paint: { 'fill-color': color, 'fill-opacity': 0.55 } });
      map.addLayer({ id: LINE, type: 'line', source: SOURCE, 'source-layer': 'parcel',
        paint: { 'line-color': color, 'line-width': 1.2 } });
      map.addLayer({ id: SELECTED, type: 'line', source: SOURCE, 'source-layer': 'parcel',
        filter: ['==',['get','id'],''], paint: { 'line-color': '#ffec00', 'line-width': 4 } });
      map.on('click', FILL, click);
      map.on('mouseenter',FILL,enter);
      map.on('mouseleave',FILL,leave);
    };
    install();
    map.on('styledata',install);
    map.on('idle',install);
    map.on('zoomend',updateZoom);
    map.on('error',tileError);
    return () => {
      disposed = true; ctrl.abort();
      map.off('styledata',install); map.off('idle',install); map.off('zoomend',updateZoom); map.off('error',tileError);
      map.off('click',FILL,click); map.off('mouseenter',FILL,enter); map.off('mouseleave',FILL,leave);
      if (!map.getStyle()) return;
      leave();
      for (const id of [SELECTED,LINE,FILL]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map,active,scopes,search,classification,revision,select]);
  useEffect(() => {
    if (!map || !active) return;
    const update = () => {
      const known = PARCEL_CLASSES.map(c => c.name.toLowerCase());
      const enabled = known.filter(key => parcel.enabled[key]);
      const classification = ['coalesce',['get','classification'],'unspecified'];
      const filter = ['any', ['in',classification,['literal',enabled]],
        ['all',['!', ['in',classification,['literal',known]]],parcel.enabled.other === true]] as unknown as ExpressionSpecification;
      for (const id of [FILL,LINE,SELECTED]) {
        if (!map.getLayer(id)) continue;
        const visibility = parcel.visible ? 'visible' : 'none';
        if (map.getLayoutProperty(id,'visibility') !== visibility) map.setLayoutProperty(id,'visibility',visibility);
        const layerFilter = id === SELECTED ? ['all',filter,['==',['get','id'],selected?.id || '']] as ExpressionSpecification : filter;
        if (JSON.stringify(map.getFilter(id)) !== JSON.stringify(layerFilter)) map.setFilter(id,layerFilter);
        const property = id === FILL ? 'fill-opacity' : 'line-opacity';
        const opacity = id === FILL ? 0.55*parcel.opacity : parcel.opacity;
        if (map.getPaintProperty(id,property) !== opacity) map.setPaintProperty(id,property,opacity);
      }
    };
    update(); map.on('styledata',update); map.on('idle',update);
    return () => { map.off('styledata',update); map.off('idle',update); };
  }, [map,active,selected,search,classification,revision,parcel]);
  if (!active || !parcel.visible || (!error && zoom >= 12)) return null;
  return <Alert color={error ? 'red' : 'blue'} style={{ position: 'absolute', top: 12, left: 12, maxWidth: 340, zIndex: 5 }}>
    {error || 'Zoom in to level 12 or use Locate to see parcel boundaries.'}
  </Alert>;
}
