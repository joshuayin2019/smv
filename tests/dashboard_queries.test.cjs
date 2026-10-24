const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function controller(failPoi = false, failParcel = false) {
  const calls = [], modules = new Map();
  const db = { conn: { query: async (sql, params) => {
    calls.push({ sql, params });
    assert.equal(Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]))), params.length);
    if (sql.includes('AVG(NULLIF(r, 0))')) return { rows: [{ roads: '15', r: 12000, c: 24000, a: null, i: 8000, years: [{ name: '2024', value: '15' }] }] };
    if (sql.includes('FROM data.parcel')) {
      if (failParcel) throw new Error('Mock parcel unavailable');
      return { rows: [{ classification: 'residential', value: '20', synthetic: '15' }, { classification: 'unspecified', value: '3', synthetic: '0' }] };
    }
    if (sql.includes('AS categories')) {
      if (failPoi) throw new Error('Mock POI unavailable');
      return { rows: [{ total: '120', categories: [{ name: 'School', value: '60' }], areas: [{ name: 'Pasig', value: '120' }] }] };
    }
    return { rows: [{ population: '1000', male: '480', female: '520', barangays: '10', municipalities: '2', urban: '8', rural: '1', unknown: '1', building_type_single_house: '200', floors_one_floor: '100', year_built_2020: '40' }] };
  } } };
  function load(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(id => id === '@/lib/db' ? db : load((id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'), module, module.exports);
    return module.exports;
  }
  return { calls, api: load('src/lib/pages/dashboard/dashboard_controller.ts'), config: load('src/lib/pages/dashboard/dashboard_types.ts') };
}
const scope = [{ scope_level: 4, code: '137404' }];

test('dashboard keeps each dataset in its own scope and converts PostgreSQL numeric counts', async () => {
  const c = controller();
  const data = await c.api.loadDashboard({ smv: scope, poi: scope, psa: scope, parcel: scope });
  assert.equal(c.calls.length, 4);
  for (const call of c.calls) assert.deepEqual(call.params, ['137404']);
  assert.equal(data.market.roads, 15);
  assert.equal(data.market.averages.find(item => item.name === 'Residential').value, 12000);
  assert.equal(data.market.averages.some(item => item.name === 'Agricultural'), false, 'missing averages are not invented as zero');
  assert.equal(data.poi.total, 120);
  assert.equal(data.parcel.total, 23);
  assert.equal(data.parcel.synthetic, 15);
  assert.equal(data.parcel.classifications.find(c => c.name === 'Residential').value, 20);
  assert.equal(data.parcel.classifications.find(c => c.name === 'Unspecified').value, 3);
  assert.equal(data.poi.categories[0].value, 60);
  assert.equal(data.demographic.population, 1000);
  assert.equal(data.demographic.classes.find(item => item.name === 'Unknown').value, 1);
  assert.equal(data.demographic.floors.find(item => item.name === '1 floor').value, 100);
  assert.equal(data.errors.length, 0);
});

test('empty scopes return empty summaries without touching the database', async () => {
  const c = controller();
  const data = await c.api.loadDashboard({ smv: [], poi: [], psa: [], parcel: [] });
  assert.equal(c.calls.length, 0);
  assert.equal(data.market.roads, 0);
  assert.equal(data.poi.total, 0);
  assert.equal(data.demographic.population, 0);
});

test('simultaneous dashboard loads share queries and successful results are cached by scope', async () => {
  const c = controller();
  const scopes = { smv: scope, poi: scope, psa: scope, parcel: scope };
  await Promise.all([c.api.loadDashboard(scopes), c.api.loadDashboard(scopes)]);
  assert.equal(c.calls.length, 4);
  await c.api.loadDashboard(scopes);
  assert.equal(c.calls.length, 4);
  await c.api.loadDashboard({ smv: [], poi: scope, psa: [], parcel: [] });
  assert.equal(c.calls.length, 5);
});

test('one failed source preserves other sections and is not cached as a successful zero', async () => {
  const c = controller(true);
  const data = await c.api.loadDashboard({ smv: scope, poi: scope, psa: scope, parcel: scope });
  assert.equal(data.poi, null);
  assert.equal(data.market.roads, 15);
  assert.equal(data.demographic.population, 1000);
  assert.deepEqual(data.errors, ['Points of interest could not be loaded']);
});

test('parcel failure preserves other sections and does not return sample counts', async () => {
  const c = controller(false, true);
  const data = await c.api.loadDashboard({ smv: scope, poi: scope, psa: scope, parcel: scope });
  assert.equal(data.parcel, null);
  assert.equal(data.poi.total, 120);
  assert.deepEqual(data.errors, ['Parcels could not be loaded']);
});

test('parcel scope stays independent of other datasets and the cache key', async () => {
  const c = controller();
  const scopes = { smv: [], poi: [], psa: [], parcel: [{ scope_level: 2, code: 'PH130000000' }] };
  await c.api.loadDashboard(scopes);
  assert.equal(c.calls.length, 1);
  assert.deepEqual(c.calls[0].params, ['PH130000000']);
  assert.match(c.calls[0].sql, /b.reg_code = \$1/);
  const empty = await c.api.loadDashboard({ ...scopes, parcel: [] });
  assert.equal(empty.parcel.total, 0);
  assert.ok(empty.parcel.classifications.every(c => c.value === 0));
  assert.equal(c.calls.length, 1);
});
