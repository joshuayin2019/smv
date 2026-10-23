const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the component's actual effects with a map whose style loads later.
function harness() {
  const slots = [], effects = [], maps = [], requests = [];
  let cursor = 0, pending = [], force = false;
  const container = { clientWidth: 800, clientHeight: 385 };
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value === null && i === 0 ? container : value }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useEffect(callback, deps) {
      const i = cursor++, previous = effects[i];
      if (force || !previous || deps.some((value, j) => value !== previous.deps[j])) pending.push({ i, callback, deps });
    },
  };
  class Map {
    constructor() { this.events = new global.Map(); this.layers = new global.Map(); this.sources = new global.Map(); this.canvas = { style: {} }; maps.push(this); }
    on(event, ...args) { const key = `${event}:${args.length === 2 ? args[0] : ''}`; const set = this.events.get(key) ?? new Set(); set.add(args.at(-1)); this.events.set(key, set); }
    off(event, ...args) { this.events.get(`${event}:${args.length === 2 ? args[0] : ''}`)?.delete(args.at(-1)); }
    emit(event) { for (const fn of this.events.get(`${event}:`) ?? []) fn(); }
    load() { this.style = { layers: [{ id: 'labels', type: 'symbol' }] }; this.emit('load'); }
    getStyle() { return this.style; }
    getLayer(id) { return this.layers.get(id); }
    getSource(id) { return this.sources.get(id); }
    addSource(id, source) { assert.ok(this.style, 'source added before style loaded'); assert.ok(!this.sources.has(id)); this.sources.set(id, source); }
    removeSource(id) { assert.equal(this.layers.size, 0, 'remove dependent layers before source'); this.sources.delete(id); }
    addLayer(layer) { assert.ok(this.style); assert.ok(!this.layers.has(layer.id)); this.layers.set(layer.id, layer); }
    removeLayer(id) { this.layers.delete(id); }
    getCanvas() { return this.canvas; }
    remove() { this.removed = true; this.style = undefined; }
  }
  class Popup { remove() {} }
  const scope = [{ scope_level: 4, code: 'PH137403000' }];
  const state = { auth: { scope_psa: scope, scope_poi: scope }, setActivePage() {} };
  const mocks = {
    react, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'maplibre-gl': { Map, Popup, setWorkerUrl() {} }, 'maplibre-gl/dist/maplibre-gl.css': {},
    '@mantine/core': { Popover: { Target() {}, Dropdown() {} }, Radio: { Group() {} } }, '@tabler/icons-react': {},
    '@/stores/global_stores': { useGlobalStore: (selector) => selector(state) }, '@/lib/config': { basePath: '' },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/components/pages/dashboard/dashboard_map.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = vm.createContext({
    require: (id) => { assert.ok(id in mocks, id); return mocks[id]; }, module, exports: module.exports,
    window: { devicePixelRatio: 1, location: { origin: 'http://localhost' } },
    ResizeObserver: class { observe() {} disconnect() {} },
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: (url, options) => { requests.push({ url, ...options }); return new Promise(() => {}); },
  });
  vm.runInContext(code, context);
  function render(refresh = false) {
    cursor = 0; pending = []; force = refresh;
    module.exports.default();
    for (const effect of pending) {
      effects[effect.i]?.cleanup?.();
      effects[effect.i] = { deps: effect.deps, cleanup: effect.callback() };
    }
  }
  return { maps, slots, requests, render, unmount: () => effects.forEach((effect) => effect?.cleanup?.()) };
}

test('initial render waits for style loading before installing dashboard layers', () => {
  const h = harness(); h.render();
  assert.equal(h.maps[0].layers.size, 0);
  h.maps[0].load(); h.render();
  assert.equal(h.maps[0].layers.size, 2);
  h.unmount();
});

test('Fast Refresh with previous loaded state waits for the replacement map', () => {
  const h = harness(); h.render(); h.maps[0].load(); h.render();
  h.render(true);
  assert.equal(h.maps[0].removed, true);
  assert.equal(h.maps[1].layers.size, 0);
  assert.equal(h.maps[0].events.get('load:').size, 0);
  assert.equal(h.requests[0].signal.aborted, true);
  h.maps[1].load(); h.render();
  assert.equal(h.maps[1].layers.size, 2);
  h.unmount();
});

test('switching layers cleans up handlers and replaces the source without duplicates', () => {
  const h = harness(); h.render(); h.maps[0].load(); h.render();
  // The third hook is the selected layer mode.
  h.slots[2] = 'poi'; h.render();
  const map = h.maps[0];
  assert.equal(map.layers.get('dashboard-area-fill').type, 'circle');
  assert.equal(map.events.get('mousemove:dashboard-area-fill').size, 1);
  h.slots[2] = 'population'; h.render();
  assert.equal(map.layers.get('dashboard-area-fill').type, 'fill');
  assert.equal(map.events.get('mousemove:dashboard-area-fill').size, 1);
  h.unmount();
});
