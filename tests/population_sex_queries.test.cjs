const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function controllers(response = { rows: [] }) {
  const calls = [], cache = new Map();
  const db = { conn: { query: async (sql, params) => {
    const positions = [...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
    assert.equal(Math.max(0, ...positions), params.length);
    calls.push({ sql, params });
    return response;
  } } };
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInThisContext(`(function(require, module, exports) { ${code}\n})`, { filename })(id =>
      id === '@/lib/db' ? db : load((id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'),
      module, module.exports);
    return module.exports;
  }
  const root = 'src/lib/pages/demographic/population/';
  return { calls, table: load(root + 'population_table_controller.ts'),
    charts: load(root + 'population_charts_controller.ts'), svg: load(root + 'population_categories.ts').populationSexSvg };
}

test('table exposes both sex counts at every level and preserves existing population totals', async () => {
  const c = controllers();
  for (const level of ['region', 'province', 'municipality', 'barangay']) {
    const parsed = c.table.parseTableQuery(new URLSearchParams({ level,
      scope: JSON.stringify([{ scope_level: 4, code: '137404' }]), search: 'Pasig', page: '2', pageSize: '10' }));
    assert.equal(parsed.ok, true);
    assert.equal((await c.table.loadPopulationTable(parsed.query)).success, true);
    const query = c.calls.at(-1);
    assert.ok(query.sql.includes('AS sex_male'));
    assert.ok(query.sql.includes('AS sex_female'));
    assert.deepEqual(query.params.slice(-2), [10, 10]);
    if (level !== 'barangay') {
      assert.ok(query.sql.includes('SUM(b.population)::bigint AS population'));
      assert.ok(query.sql.includes('m.population'));
      assert.ok(query.sql.includes('LEFT JOIN'));
      assert.ok(query.sql.includes('SUM(b.sex_male)'));
    }
  }
});

test('hover returns numeric sex counts with scoped code and viewport bindings', async () => {
  const c = controllers({ rows: [{ code: '137404', name: 'Pasig', population: '100', sex_male: '45', sex_female: '55', lng: '121', lat: '14.5' }] });
  for (const level of ['region', 'province', 'municipality', 'barangay']) {
    const result = await c.charts.loadPopulationCharts(level, [-180, -90, 180, 90], [{ scope_level: 4, code: '137404' }], '137404');
    assert.equal(result.success, true);
    assert.deepEqual(result.data.items[0].values, { sex_male: 45, sex_female: 55 });
    assert.deepEqual(c.calls.at(-1).params, ['137404', -180, -90, 180, 90, '137404']);
  }
});

test('empty scopes never issue sex queries and invalid codes are rejected', async () => {
  const c = controllers();
  const parsed = c.table.parseTableQuery(new URLSearchParams());
  assert.equal((await c.table.loadPopulationTable(parsed.query)).data.total, 0);
  assert.equal((await c.charts.loadPopulationCharts('municipality', [-180, -90, 180, 90], [])).data.items.length, 0);
  assert.equal((await c.charts.loadPopulationCharts('municipality', [-180, -90, 180, 90], [], "x' OR TRUE")).status, 400);
  assert.equal(c.calls.length, 0);
});

test('SVG handles empty and single-sex data without percentages or invalid geometry', () => {
  const { svg } = controllers();
  for (const [m, f] of [[0, 0], [100, 0], [0, 100], [45, 55], [null, undefined]]) {
    const markup = svg(m, f);
    assert.ok(!markup.includes('NaN'));
    assert.ok(!markup.includes('Infinity'));
    assert.ok(!markup.includes('%'));
    assert.ok(!markup.includes('<text'));
  }
  assert.ok(svg(0, 0).includes('#cbd5e1'));
  assert.ok(svg(45, 55).includes('stroke-dasharray'));
});
