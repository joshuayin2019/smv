const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(parcelPatch = {}) {
  const effects = [], cleanups = [], sources = new Map(), layers = new Map(), events = new Map();
  const state = { ready: false, filters: 0 };
  const parcel = { visible: true,opacity: 1,enabled: { residential: true,commercial: true,agricultural: true,industrial: true,other: true },...parcelPatch };
  const requests = [], selections = [];
  const map = {
    isStyleLoaded: () => state.ready, getStyle: () => ({}),getZoom: () => 14,
    getCanvas: () => ({ style: {} }),getSource: id => sources.get(id),getLayer: id => layers.get(id),
    addSource: (id,value) => { assert.ok(state.ready); sources.set(id,value); },
    addLayer: layer => layers.set(layer.id,layer), removeLayer: id => layers.delete(id),
    removeSource: id => { assert.equal(layers.size,0); sources.delete(id); },
    getFilter: id => layers.get(id)?.filter,
    getLayoutProperty: (id,key) => layers.get(id)?.layout?.[key],
    setLayoutProperty: (id,key,value) => { const l = layers.get(id); l.layout ||= {}; l.layout[key] = value; },
    getPaintProperty: (id,key) => layers.get(id)?.paint?.[key],
    setPaintProperty: (id,key,value) => { layers.get(id).paint[key] = value; },
    setFilter: (id,filter) => { state.filters++; layers.get(id).filter = filter; },
    on: (event,...args) => { const key = event + ':' + (args.length === 2 ? args[0] : ''); const set = events.get(key) || new Set(); set.add(args.at(-1)); events.set(key,set); },
    off: (event,...args) => events.get(event + ':' + (args.length === 2 ? args[0] : ''))?.delete(args.at(-1)),
  };
  const mocks = {
    react: { useEffect: fn => effects.push(fn), useState: v => [v,() => {}] },
    'react/jsx-runtime': { jsx: () => null,jsxs: () => null },
    '@mantine/core': {}, '@/lib/config': { basePath: '/smv' },
    '@/lib/pages/parcel/parcel_types': { PARCEL_CLASSES: [{ name: 'Residential',color: '#2458bd' },{ name: 'Commercial',color: '#f59e0b' },{ name: 'Agricultural',color: '#22a06b' },{ name: 'Industrial',color: '#9a63da' }] },
    '@/stores/global_stores': { useGlobalStore: fn => fn({ activePage: 'Parcels',auth: { scope_parcel: [] } }) },
    '@/stores/map_stores': { useMapStore: fn => fn({ map,parcel }) },
    '@/stores/parcel_stores': { useParcelStore: () => ({ search: '',classification: '',selected: { id: '7' },select: row => selections.push(row),revision: 0 }) },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/components/pages/parcel/map_parcel.tsx','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS,target: ts.ScriptTarget.ES2020,jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code,{ require: id => { assert.ok(id in mocks,id); return mocks[id]; },module,exports: module.exports,
    AbortController,URLSearchParams,window: { location: { origin: 'http://localhost' } },
    fetch: (url,options) => new Promise(resolve => requests.push({ url,options,resolve })) });
  module.exports.default();
  effects.forEach(fn => cleanups.push(fn()));
  const emit = event => { for (const fn of events.get(event + ':') || []) fn(); };
  return { state,layers,sources,events,emit,requests,selections,unmount: () => cleanups.forEach(fn => fn?.()) };
}

test('parcel layer waits for idle style readiness and cleans up sources and handlers', () => {
  const h = harness();
  assert.equal(h.sources.size,0);
  h.state.ready = true; h.emit('idle'); h.emit('styledata');
  assert.equal(h.layers.size,3);
  assert.equal(h.sources.size,1);
  assert.ok(h.sources.get('parcel-data').tiles[0].startsWith('http://localhost/smv/api/pages/parcel/tiles/'));
  h.unmount();
  assert.equal(h.sources.size,0);
  assert.ok([...h.events.values()].every(set => set.size === 0));
});

test('selected parcel filter avoids repeated style updates', () => {
  const h = harness();
  h.state.ready = true; h.emit('idle'); h.emit('styledata');
  assert.equal(h.state.filters,3);
  h.emit('styledata'); h.emit('styledata');
  assert.equal(h.state.filters,3);
  h.unmount();
});

test('parcel layer control applies visibility, opacity and classification filters to all layers', () => {
  const h = harness({ visible: false,opacity: 0.4,enabled: { residential: true,commercial: false,agricultural: false,industrial: false,other: false } });
  h.state.ready = true; h.emit('idle');
  for (const layer of h.layers.values()) assert.equal(layer.layout.visibility,'none');
  assert.equal(h.layers.get('parcel-fill').paint['fill-opacity'],0.55*0.4);
  assert.equal(h.layers.get('parcel-line').paint['line-opacity'],0.4);
  const filter = h.layers.get('parcel-fill').filter;
  assert.equal(JSON.stringify(filter[1][2]),JSON.stringify(['literal',['residential']]));
  assert.equal(filter[2][2],false);
  h.unmount();
});

test('map clicks select the latest parcel for the shared floating details window', async () => {
  const h = harness();
  h.state.ready = true; h.emit('idle');
  const click = [...h.events.get('click:parcel-fill')][0];
  const first = click({ features: [{ properties: { id: '7' } }] });
  const second = click({ features: [{ properties: { id: '8' } }] });
  h.requests[1].resolve({ ok: true,json: async () => ({ id: '8' }) }); await second;
  h.requests[0].resolve({ ok: true,json: async () => ({ id: '7' }) }); await first;
  assert.equal(h.selections.length,1);
  assert.equal(h.selections[0].id,'8');
  h.unmount();
});
