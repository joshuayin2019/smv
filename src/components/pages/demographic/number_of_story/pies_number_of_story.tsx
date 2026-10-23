import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useMapStore } from '@/stores/map_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { useBuildingStoryStore } from '@/stores/demographic/number_of_story_stores';
import { basePath } from '@/lib/config';
import { BUILDING_STORY_CATEGORIES, pieSlicePath, type BuildingStoryChart } from '@/lib/pages/demographic/number_of_story/number_of_story_categories';

const MIN_ZOOM = { region: 3, province: 5, municipality: 7, barangay: 11 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const chartDimensions = new WeakMap<HTMLElement, { width: number; height: number }>();

function arrangeCharts(map: maplibregl.Map, markers: Map<string, maplibregl.Marker>, minZoom: number) {
  const selected = useBuildingStoryStore.getState().selectedBuildingStory?.code;
  const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
  // The response is ordered by building count. Always place the selection first.
  const ordered = [...markers].sort(([a], [b]) => Number(b === selected) - Number(a === selected));
  const canvas = map.getCanvas();
  const viewportWidth = canvas.clientWidth;
  const viewportHeight = canvas.clientHeight;
  // Batch layout reads before any style writes; cache dimensions for unchanged markers.
  const measured = ordered.map(([, marker]) => {
    const element = marker.getElement();
    const point = map.project(marker.getLngLat());
    let size = chartDimensions.get(element);
    if (!size) {
      size = { width: element.offsetWidth + 8, height: element.offsetHeight + 8 };
      chartDimensions.set(element, size);
    }
    return { element, point, ...size };
  });
  for (const { element, point, width, height } of measured) {
    const box = { left: point.x - width / 2, right: point.x + width / 2,
      top: point.y - height / 2, bottom: point.y + height / 2 };
    const hidden = map.getZoom() < minZoom || box.right < 0 || box.left > viewportWidth ||
      box.bottom < 0 || box.top > viewportHeight || occupied.some(other =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    const visibility = hidden ? 'hidden' : 'visible';
    if (element.style.visibility !== visibility) {
      element.style.visibility = visibility;
      element.style.pointerEvents = hidden ? 'none' : 'auto';
    }
    if (!hidden) occupied.push(box);
  }
}

function chartElement(item: BuildingStoryChart, select: () => void) {
  const root = document.createElement('div');
  root.dataset.buildingStoryCode = item.code;
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Select ${item.name}, ${item.number_of_story.toLocaleString()} buildings in reported floor categories`);
  button.style.cssText = 'display:block;width:44px;height:44px;margin:auto;padding:0;border:0;background:transparent;cursor:pointer;border-radius:50%;filter:drop-shadow(0 1px 2px #0005)';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '44');
  svg.setAttribute('height', '44');
  let start = -Math.PI / 2;
  for (const category of BUILDING_STORY_CATEGORIES) {
    const value = Math.max(0, Number(item.values[category.field]) || 0);
    const fraction = item.number_of_story > 0 ? value / item.number_of_story : 0;
    if (value === 0) continue;
    const slice = document.createElementNS(SVG_NS, 'path');
    slice.setAttribute('d', pieSlicePath(start, fraction));
    slice.setAttribute('fill', category.color);
    slice.setAttribute('stroke', '#202938');
    slice.setAttribute('stroke-width', '0.45');
    svg.appendChild(slice);
    start += fraction * Math.PI * 2;
  }
  button.appendChild(svg);
  button.addEventListener('click', (event) => { event.stopPropagation(); select(); });
  const label = document.createElement('div');
  label.textContent = item.name;
  label.style.cssText = 'max-width:130px;text-align:center;font:11px sans-serif;color:#243449;text-shadow:0 0 3px white,0 0 3px white;pointer-events:none';
  root.append(button, label);
  return root;
}

function hoverDetails(item: BuildingStoryChart) {
  const root = document.createElement('div');
  root.style.cssText = 'min-width:240px;color:#243449;font:12px sans-serif';
  const title = document.createElement('strong');
  title.textContent = item.name;
  root.appendChild(title);
  const chart = chartElement(item, () => {});
  chart.removeAttribute('data-building-story-code');
  chart.lastElementChild?.remove();
  const button = chart.querySelector('button')!;
  button.style.width = '100px';
  button.style.height = '100px';
  button.tabIndex = -1;
  chart.querySelector('svg')!.setAttribute('width', '100');
  chart.querySelector('svg')!.setAttribute('height', '100');
  root.appendChild(chart);
  const total = document.createElement('div');
  total.textContent = `${item.number_of_story.toLocaleString()} buildings in reported floor categories`;
  total.style.marginBottom = '6px';
  root.appendChild(total);
  for (const category of BUILDING_STORY_CATEGORIES) {
    const value = Number(item.values[category.field]) || 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:3px';
    const swatch = document.createElement('span');
    swatch.style.cssText = `background:${category.color};width:10px;height:10px;flex-shrink:0`;
    const text = document.createElement('span');
    text.textContent = `${category.label}: ${value.toLocaleString()} (${item.number_of_story > 0 ? (value / item.number_of_story * 100).toFixed(1) : '0.0'}%)`;
    row.append(swatch, text);
    root.appendChild(row);
  }
  return root;
}

export default function BuildingStoryPies({ visible = true, opacity = 1 }: { visible?: boolean; opacity?: number }) {
  const map = useMapStore(s => s.map);
  const activePage = useGlobalStore(s => s.activePage);
  const scope = useGlobalStore(s => s.auth?.scope_psa);
  const scopeKey = JSON.stringify(scope ?? []);
  const mode = useBuildingStoryStore(s => s.number_of_storyMode);
  const selectedCode = useBuildingStoryStore(s => s.selectedBuildingStory?.code);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const setStatus = useBuildingStoryStore(s => s.setChartStatus);
  const boundaryHoverEnabled = useBuildingStoryStore(s => s.boundaryHoverEnabled);
  const show = visible && activePage === 'Number of Story of Building';

  useEffect(() => {
    if (!map || !show || !scope?.length) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, maxWidth: '300px' });
    const cache = new Map<string, BuildingStoryChart>();
    const container = map.getContainer();
    let code: string | undefined;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let location: maplibregl.LngLat;
    let lastHoverAt = 0;
    const hide = () => {
      if (code && map.getLayer('number_of_story-hover-fill')) {
        map.setFilter('number_of_story-hover-fill', ['==', ['get', 'code'], '']);
      }
      code = undefined;
      clearTimeout(timer);
      request?.abort();
      popup.remove();
    };
    const display = (item: BuildingStoryChart) => {
      popup.setLngLat(location).setDOMContent(hoverDetails(item)).addTo(map);
      // Keep the popup from intercepting the pointer and obscuring tiny polygons.
      popup.getElement().style.pointerEvents = 'none';
    };
    const hover = (event: MouseEvent) => {
      if (!boundaryHoverEnabled || map.isMoving()) { hide(); return; }
      const now = performance.now();
      if (now - lastHoverAt < 80) return;
      lastHoverAt = now;
      const target = event.target as HTMLElement;
      const marker = target.closest<HTMLElement>('[data-building-story-code]');
      if (!boundaryHoverEnabled) { hide(); return; }
      if (!marker && target !== map.getCanvas()) { hide(); return; }
      const rect = map.getCanvas().getBoundingClientRect();
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      location = map.unproject(point);
      const feature = !marker && map.getLayer('number_of_story-fill')
        ? map.queryRenderedFeatures(point, { layers: ['number_of_story-fill'] })[0] : undefined;
      const nextCode = marker?.dataset.buildingStoryCode ?? (feature?.properties?.code != null ? String(feature.properties.code) : undefined);
      if (!nextCode) { hide(); return; }
      if (code === nextCode) {
        if (popup.isOpen()) popup.setLngLat(location);
        return;
      }
      hide();
      code = nextCode;
      if (map.getLayer('number_of_story-hover-fill')) {
        map.setFilter('number_of_story-hover-fill', ['==', ['to-string', ['get', 'code']], nextCode]);
      }
      const cached = cache.get(nextCode);
      if (cached) { display(cached); return; }
      timer = setTimeout(async () => {
        const ctrl = new AbortController();
        request = ctrl;
        const sp = new URLSearchParams({ scope: scopeKey, level: mode, code: nextCode, bbox: '[-180,-90,180,90]' });
        try {
          const response = await fetch(`${basePath}/api/pages/demographic/number_of_story/charts?${sp}`, { signal: ctrl.signal });
          if (!response.ok) throw new Error('Could not load area details');
          const data = await response.json() as { items: BuildingStoryChart[] };
          if (ctrl.signal.aborted || code !== nextCode) return;
          const item = data.items[0];
          if (item) { cache.set(nextCode, item); display(item); }
        } catch {
          if (!ctrl.signal.aborted) hide();
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
  }, [map, show, mode, scopeKey, boundaryHoverEnabled]);

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
          const response = await fetch(`${basePath}/api/pages/demographic/number_of_story/charts?${sp}`, { signal: request.signal });
          if (!response.ok) throw new Error('Could not load charts');
          const data = await response.json() as { items: BuildingStoryChart[]; truncated: boolean };
          if (disposed || request.signal.aborted) return;
          const nextCodes = new Set(data.items.map(item => item.code));
          markers.current.forEach((marker, code) => {
            if (!nextCodes.has(code)) { marker.remove(); markers.current.delete(code); }
          });
          for (const item of data.items) {
            const signature = JSON.stringify(item);
            const existing = markers.current.get(item.code);
            if (existing?.getElement().dataset.signature === signature) continue;
            existing?.remove();
            const element = chartElement(item, () => useBuildingStoryStore.getState().setSelectedBuildingStory({
              code: item.code, name: item.name, number_of_story: item.number_of_story, level: mode,
            }));
            const selected = useBuildingStoryStore.getState().selectedBuildingStory?.code;
            element.dataset.signature = signature;
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
      setStatus('');
    };
  }, [map, show, mode, scopeKey, opacity]);

  useEffect(() => {
    if (!map || !show) return;
    let frame = 0;
    let lastArrangeAt = 0;
    const arrange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const now = performance.now();
        if (map.isMoving() && now - lastArrangeAt < 100) return;
        lastArrangeAt = now;
        arrangeCharts(map, markers.current, MIN_ZOOM[mode]);
      });
    };
    arrange();
    map.on('move', arrange);
    map.on('moveend', arrange);
    map.on('resize', arrange);
    return () => {
      cancelAnimationFrame(frame);
      map.off('move', arrange);
      map.off('moveend', arrange);
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

  return null;
}
