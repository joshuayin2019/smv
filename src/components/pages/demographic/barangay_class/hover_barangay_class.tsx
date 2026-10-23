import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useMapStore } from '@/stores/map_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { useBarangayClassStore } from '@/stores/demographic/barangay_class_stores';
import { classLabel, BARANGAY_CLASSES } from '@/lib/pages/demographic/barangay_class/barangay_class_config';

export default function HoverBarangayClass({ visible }: { visible: boolean }) {
  const map = useMapStore(s => s.map);
  const activePage = useGlobalStore(s => s.activePage);
  const enabled = useBarangayClassStore(s => s.boundaryHoverEnabled);
  useEffect(() => {
    if (!map || !visible || activePage !== 'Barangay Class' || !enabled) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    let code: string | undefined;
    let last = 0;
    const hide = () => {
      if (code && map.getLayer('barangay_class-hover-fill')) map.setFilter('barangay_class-hover-fill', ['==', ['get', 'code'], '']);
      code = undefined;
      popup.remove();
    };
    const hover = (event: maplibregl.MapMouseEvent) => {
      if (map.isMoving()) { hide(); return; }
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      if (!map.getLayer('barangay_class-fill')) return;
      const feature = map.queryRenderedFeatures(event.point, { layers: ['barangay_class-fill'] })[0];
      if (!feature) { hide(); return; }
      const props = feature.properties;
      const next = String(props.code);
      if (code === next) { popup.setLngLat(event.lngLat); return; }
      hide();
      code = next;
      if (map.getLayer('barangay_class-hover-fill')) map.setFilter('barangay_class-hover-fill', ['==', ['to-string', ['get', 'code']], next]);
      const root = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = props.name;
      const location = document.createElement('div'); location.textContent = props.mun_name;
      const label = document.createElement('div'); label.textContent = classLabel(props.urban_rural);
      label.style.cssText = 'font-weight:600;border-left:6px solid;padding-left:6px;margin-top:6px';
      label.style.borderColor = BARANGAY_CLASSES.find(c => c.value === props.urban_rural)?.color ?? '#94a3b8';
      root.append(title, location, label);
      popup.setLngLat(event.lngLat).setDOMContent(root).addTo(map);
      popup.getElement().style.pointerEvents = 'none';
    };
    map.on('mousemove', hover);
    map.on('movestart', hide);
    map.getCanvas().addEventListener('mouseleave', hide);
    return () => {
      hide(); map.off('mousemove', hover); map.off('movestart', hide);
      map.getCanvas().removeEventListener('mouseleave', hide);
    };
  }, [map, visible, activePage, enabled]);
  return null;
}
