import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useMapStore } from '@/stores/map_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { useYearBuiltStore } from '@/stores/demographic/year_built_stores';
import { basePath } from '@/lib/config';
import { YEAR_BUILT_CATEGORIES, pieSlicePath, type YearBuiltChart } from '@/lib/pages/demographic/year_built/year_built_categories';

const MIN_ZOOM = { region: 3, province: 5, municipality: 7, barangay: 11 };
const SVG_NS = 'http://www.w3.org/2000/svg';

function arrangeCharts(map: maplibregl.Map, markers: Map<string, maplibregl.Marker>, minZoom: number) {
  const selected = useYearBuiltStore.getState().selectedYearBuilt?.code;
  const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
  // The response is ordered by building count. Always place the selection first.
  const ordered = [...markers].sort(([a], [b]) => Number(b === selected) - Number(a === selected));
  const canvas = map.getCanvas();
  for (const [, marker] of ordered) {
    const element = marker.getElement();
    const point = map.project(marker.getLngLat());
    const width = element.offsetWidth + 8;
    const height = element.offsetHeight + 8;
    const box = { left: point.x - width / 2, right: point.x + width / 2,
      top: point.y - height / 2, bottom: point.y + height / 2 };
    const hidden = map.getZoom() < minZoom || box.right < 0 || box.left > canvas.clientWidth ||
      box.bottom < 0 || box.top > canvas.clientHeight || occupied.some(other =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    element.style.visibility = hidden ? 'hidden' : 'visible';
    element.style.pointerEvents = hidden ? 'none' : 'auto';
    if (!hidden) occupied.push(box);
  }
}

function chartElement(item: YearBuiltChart, select: () => void) {
  const root = document.createElement('div');
  root.dataset.yearBuiltCode = item.code;
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Select ${item.name}, ${item.year_built.toLocaleString()} buildings in reported years`);
  button.style.cssText = 'display:block;width:44px;height:44px;margin:auto;padding:0;border:0;background:transparent;cursor:pointer;border-radius:50%;filter:drop-shadow(0 1px 2px #0005)';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '44');
  svg.setAttribute('height', '44');
  let start = -Math.PI / 2;
  const details = [item.name];
  for (const category of YEAR_BUILT_CATEGORIES) {
    const value = Math.max(0, Number(item.values[category.field]) || 0);
    const fraction = item.year_built > 0 ? value / item.year_built : 0;
    details.push(`${category.label}: ${value.toLocaleString()} (${(fraction * 100).toFixed(1)}%)`);
    if (value === 0) continue;
    const slice = document.createElementNS(SVG_NS, 'path');
    slice.setAttribute('d', pieSlicePath(start, fraction));
    slice.setAttribute('fill', category.color);
    slice.setAttribute('stroke', '#202938');
    slice.setAttribute('stroke-width', '0.45');
    svg.appendChild(slice);
    start += fraction * Math.PI * 2;
  }
  button.title = [...details, 'Unknown: not reported in the supplied data'].join('\n');
  button.appendChild(svg);
  button.addEventListener('click', (event) => { event.stopPropagation(); select(); });
  const label = document.createElement('div');
  label.textContent = item.name;
  label.style.cssText = 'max-width:130px;text-align:center;font:11px sans-serif;color:#243449;text-shadow:0 0 3px white,0 0 3px white;pointer-events:none';
  root.append(button, label);
  return root;
}

function hoverDetails(item: YearBuiltChart) {
  const root = document.createElement('div');
  root.style.cssText = 'min-width:240px;color:#243449;font:12px sans-serif';
  const title = document.createElement('strong');
  title.textContent = item.name;
  root.appendChild(title);
  const chart = chartElement(item, () => {});
  chart.removeAttribute('data-year-built-code');
  chart.lastElementChild?.remove();
  const button = chart.querySelector('button')!;
  button.style.width = '100px';
  button.style.height = '100px';
  button.tabIndex = -1;
  chart.querySelector('svg')!.setAttribute('width', '100');
  chart.querySelector('svg')!.setAttribute('height', '100');
  root.appendChild(chart);
  const total = document.createElement('div');
  total.textContent = `${item.year_built.toLocaleString()} buildings in reported years`;
  total.style.marginBottom = '6px';
  root.appendChild(total);
  for (const category of YEAR_BUILT_CATEGORIES) {
    const value = Number(item.values[category.field]) || 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:3px';
    const swatch = document.createElement('span');
    swatch.style.cssText = `background:${category.color};width:10px;height:10px;flex-shrink:0`;
    const text = document.createElement('span');
    text.textContent = `${category.label}: ${value.toLocaleString()} (${item.year_built > 0 ? (value / item.year_built * 100).toFixed(1) : '0.0'}%)`;
    row.append(swatch, text);
    root.appendChild(row);
  }
  const unknown = document.createElement('div');
  unknown.textContent = 'Unknown: not reported';
  unknown.style.marginTop = '6px';
  root.appendChild(unknown);
  return root;
}

export default function YearBuiltPies({ visible = true, opacity = 1 }: { visible?: boolean; opacity?: number }) {
  const map = useMapStore(s => s.map);
  const activePage = useGlobalStore(s => s.activePage);
  const scope = useGlobalStore(s => s.auth?.scope_psa);
  const scopeKey = JSON.stringify(scope ?? []);
  const mode = useYearBuiltStore(s => s.year_builtMode);
  const selectedCode = useYearBuiltStore(s => s.selectedYearBuilt?.code);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const [status, setStatus] = useState('');
  const show = visible && activePage === 'Year Built of Buildings';

  useEffect(() => {
    if (!map || !show || !scope?.length) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, maxWidth: '300px' });
    const cache = new Map<string, YearBuiltChart>();
    const container = map.getContainer();
    let code: string | undefined;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let location: maplibregl.LngLat;
    const hide = () => {
      code = undefined;
      clearTimeout(timer);
      request?.abort();
      popup.remove();
    };
    const display = (item: YearBuiltChart) => {
      popup.setLngLat(location).setDOMContent(hoverDetails(item)).addTo(map);
      // Keep the popup from intercepting the pointer and obscuring tiny polygons.
      popup.getElement().style.pointerEvents = 'none';
    };
    const hover = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const marker = target.closest<HTMLElement>('[data-year-built-code]');
      if (!marker && target !== map.getCanvas()) { hide(); return; }
      const rect = map.getCanvas().getBoundingClientRect();
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      location = map.unproject(point);
      const feature = !marker && map.getLayer('year_built-fill')
        ? map.queryRenderedFeatures(point, { layers: ['year_built-fill'] })[0] : undefined;
      const nextCode = marker?.dataset.yearBuiltCode ?? (feature?.properties?.code != null ? String(feature.properties.code) : undefined);
      if (!nextCode) { hide(); return; }
      if (code === nextCode) {
        if (popup.isOpen()) popup.setLngLat(location);
        return;
      }
      hide();
      code = nextCode;
      const cached = cache.get(nextCode);
      if (cached) { display(cached); return; }
      timer = setTimeout(async () => {
        const ctrl = new AbortController();
        request = ctrl;
        const sp = new URLSearchParams({ scope: scopeKey, level: mode, code: nextCode, bbox: '[-180,-90,180,90]' });
        try {
          const response = await fetch(`${basePath}/api/pages/demographic/year_built/charts?${sp}`, { signal: ctrl.signal });
          if (!response.ok) throw new Error('Could not load area details');
          const data = await response.json() as { items: YearBuiltChart[] };
          if (ctrl.signal.aborted || code !== nextCode) return;
          const item = data.items[0];
          if (item) { cache.set(nextCode, item); display(item); }
        } catch {
          if (!ctrl.signal.aborted) { popup.remove(); code = undefined; }
        }
      }, 140);
    };
    container.addEventListener('mousemove', hover);
    container.addEventListener('mouseleave', hide);
    map.on('movestart', hide);
    return () => {
      hide();
      container.removeEventListener('mousemove', hover);
      container.removeEventListener('mouseleave', hide);
      map.off('movestart', hide);
    };
  }, [map, show, mode, scopeKey]);

  useEffect(() => {
    if (!map || !show || !scope?.length) return;
    let ctrl: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const clear = () => { markers.current.forEach(m => m.remove()); markers.current.clear(); };
    const update = () => {
      ctrl?.abort();
      clearTimeout(timer);
      if (map.getZoom() < MIN_ZOOM[mode]) {
        clear();
        setStatus(`Zoom in to see ${mode} charts`);
        return;
      }
      timer = setTimeout(async () => {
        const request = new AbortController();
        ctrl = request;
        const bounds = map.getBounds();
        // The dataset is in the Philippines; include the whole longitude range for a world view.
        const bbox = bounds.getEast() - bounds.getWest() >= 360 ? [-180, bounds.getSouth(), 180, bounds.getNorth()]
          : [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        const sp = new URLSearchParams({ scope: scopeKey, level: mode, bbox: JSON.stringify(bbox) });
        setStatus('Loading charts…');
        try {
          const response = await fetch(`${basePath}/api/pages/demographic/year_built/charts?${sp}`, { signal: request.signal });
          if (!response.ok) throw new Error('Could not load charts');
          const data = await response.json() as { items: YearBuiltChart[]; truncated: boolean };
          if (disposed || request.signal.aborted) return;
          clear();
          for (const item of data.items) {
            const element = chartElement(item, () => useYearBuiltStore.getState().setSelectedYearBuilt({
              code: item.code, name: item.name, year_built: item.year_built, level: mode,
            }));
            const selected = useYearBuiltStore.getState().selectedYearBuilt?.code;
            element.style.opacity = String(selected && selected !== item.code ? opacity * 0.45 : opacity);
            element.querySelector('button')!.style.outline = selected === item.code ? '2px solid #ff2d55' : '';
            markers.current.set(item.code, new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(item.coordinates).addTo(map));
          }
          arrangeCharts(map, markers.current, MIN_ZOOM[mode]);
          setStatus(data.truncated ? 'Showing 300 largest areas in view; zoom in for more' : data.items.length ? '' : 'No reported building counts in view');
        } catch (error) {
          if (!disposed && !request.signal.aborted) {
            clear();
            setStatus('Could not load charts. Move the map to retry.');
          }
        }
      }, 180);
    };
    update();
    map.on('moveend', update);
    return () => {
      disposed = true;
      clearTimeout(timer);
      ctrl?.abort();
      map.off('moveend', update);
      clear();
    };
  }, [map, show, mode, scopeKey, opacity]);

  useEffect(() => {
    if (!map || !show) return;
    let frame = 0;
    const arrange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        arrangeCharts(map, markers.current, MIN_ZOOM[mode]);
      });
    };
    arrange();
    map.on('move', arrange);
    map.on('resize', arrange);
    return () => {
      cancelAnimationFrame(frame);
      map.off('move', arrange);
      map.off('resize', arrange);
    };
  }, [map, show, mode, selectedCode]);

  useEffect(() => {
    markers.current.forEach((marker, code) => {
      const element = marker.getElement();
      element.style.opacity = String(selectedCode && selectedCode !== code ? opacity * 0.45 : opacity);
      element.querySelector('button')!.style.outline = selectedCode === code ? '2px solid #ff2d55' : '';
    });
  }, [selectedCode, opacity]);

  if (!show) return null;
  return (
    <div style={{ position: 'absolute', bottom: 24, left: 12, zIndex: 5, background: '#fffffff2', padding: '10px 12px', borderRadius: 4, boxShadow: '0 1px 5px #0003', fontSize: 11, maxWidth: 240, maxHeight: '80%', overflow: 'auto' }}>
      <strong>Buildings: Year Built</strong>
      {YEAR_BUILT_CATEGORIES.map(category => (
        <div key={category.field} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
          <span style={{ background: category.color, width: 12, height: 12, display: 'inline-block' }} />{category.label}
        </div>
      ))}
      <div style={{ marginTop: 5 }}>Unknown: not reported</div>
      <div style={{ marginTop: 5, color: '#596579' }}>Slices show shares of reported years.</div>
      <div style={{ marginTop: 5, color: '#596579' }}>Overlapping charts are hidden. Zoom in to reveal them.</div>
      {status && <div role="status" style={{ marginTop: 5 }}>{status}</div>}
    </div>
  );
}
