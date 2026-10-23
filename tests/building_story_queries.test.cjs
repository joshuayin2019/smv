const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise controllers without database credentials or network access.
function controllers(response = { rows: [] }) {
  const calls = [];
  const cache = new Map();
  const db = { conn: { query: async (sql, params) => {
    calls.push({ sql, params });
    const positions = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    assert.equal(Math.max(0, ...positions), params.length, 'SQL bindings match parameters');
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
    vm.runInThisContext(`(function(require, module, exports) { ${code}\n})`, { filename })(
      (id) => id === '@/lib/db' ? db : load(
        (id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'
      ), module, module.exports
    );
    return module.exports;
  }
  const root = 'src/lib/pages/demographic/number_of_story/';
  return {
    calls,
    table: load(root + 'number_of_story_table_controller.ts'),
    summary: load(root + 'number_of_story_summary_controller.ts'),
    map: load(root + 'number_of_story_controller.ts'),
    charts: load(root + 'number_of_story_charts_controller.ts'),
    categories: load(root + 'number_of_story_categories.ts'),
    fields: load(root + 'number_of_story_sql.ts').BUILDING_STORY_FIELDS,
  };
}

test('all four table levels select every floor category, bind filters, and whitelist sorting', async () => {
  const c = controllers();
  for (const level of ['region', 'province', 'municipality', 'barangay']) {
    const sp = new URLSearchParams({ level, scope: JSON.stringify([{ scope_level: 4, code: '137404' }]),
      search: "Pasig%_'", filters: JSON.stringify({ mun_name: 'Pasig' }),
      sort: 'floors_one_floor', dir: 'desc', page: '2', pageSize: '25',
      pop: JSON.stringify({ mode: 'range', min: 10, max: 100 }) });
    const parsed = c.table.parseTableQuery(sp);
    assert.equal(parsed.ok, true);
    const result = await c.table.loadBuildingStoryTable(parsed.query);
    assert.equal(result.success, true);
    const call = c.calls.at(-1);
    for (const field of c.fields) assert.ok(call.sql.includes(` AS ${field}`));
    assert.ok(call.sql.includes('floors_one_floor DESC NULLS LAST, code ASC'));
    assert.ok(call.params.includes("%Pasig\\%\\_'%"));
    assert.ok(!call.sql.includes("Pasig"), 'search remains a bound parameter');
    assert.deepEqual(call.params.slice(-2), [25, 25]);
    if (level !== 'barangay') assert.ok(call.sql.includes('SUM('));
  }
  const parsed = c.table.parseTableQuery(new URLSearchParams({ sort: 'name; DROP TABLE x' }));
  assert.equal(parsed.query.sort, 'name');
});

test('chart queries bind viewport and scope, preserve complete grouped totals, and cap markers', async () => {
  const rows = Array.from({ length: 301 }, (_, i) => ({ code: String(i), name: 'Area',
    number_of_story: '12', lng: '121.1', lat: '14.5', floors_one_floor: '12' }));
  const c = controllers({ rows });
  for (const level of ['region', 'province', 'municipality', 'barangay']) {
    const result = await c.charts.loadBuildingStoryCharts(level, [120, 14, 122, 16], [{ scope_level: 4, code: '137404' }]);
    assert.equal(result.success, true);
    assert.equal(result.data.items.length, 300);
    assert.equal(result.data.truncated, true);
    assert.equal(result.data.items[0].values.floors_one_floor, 12);
    assert.equal(result.data.items[0].values.floors_two_floors, 0);
    assert.deepEqual(result.data.items[0].coordinates, [121.1, 14.5]);
    const call = c.calls.at(-1);
    assert.deepEqual(call.params, ['137404', 120, 14, 122, 16]);
    assert.equal(call.sql.includes('AND b.geom &&'), level === 'barangay', 'grouped totals are not clipped to viewport');
    assert.ok(call.sql.includes('ST_PointOnSurface'));
    if (level !== 'barangay') {
      assert.ok(call.sql.includes('ST_PointOnSurface(ST_Union(b.geom))'));
      assert.ok(call.sql.includes('FROM data.psa_2020_municipalities b'));
    }
  }
  const empty = controllers();
  assert.equal((await empty.charts.loadBuildingStoryCharts('barangay', [120, 14, 122, 16], [])).data.items.length, 0);
  assert.equal((await empty.charts.loadBuildingStoryCharts('bad', [], [])).status, 400);
  assert.equal(empty.calls.length, 0);
});

test('hover details target one scoped area independently of the chart cap and allow zero totals', async () => {
  const c = controllers({ rows: [{ code: '137404', name: 'Pasig', number_of_story: '0', lng: 121, lat: 14.5 }] });
  const result = await c.charts.loadBuildingStoryCharts('municipality', [-180, -90, 180, 90],
    [{ scope_level: 4, code: '137404' }], '137404');
  assert.equal(result.success, true);
  assert.equal(result.data.items[0].number_of_story, 0);
  assert.deepEqual(c.calls[0].params, ['137404', -180, -90, 180, 90, '137404']);
  assert.ok(c.calls[0].sql.includes('b.mun_code = $6'));
  assert.ok(c.calls[0].sql.includes('t.number_of_story >= 0'));
  const count = c.calls.length;
  assert.equal((await c.charts.loadBuildingStoryCharts('municipality', [-180, -90, 180, 90], [], "bad'code")).status, 400);
  assert.equal(c.calls.length, count);
});

test('pie paths support a single full-circle category and large slices', () => {
  const { pieSlicePath } = controllers().categories;
  const full = pieSlicePath(-Math.PI / 2, 1);
  assert.equal((full.match(/A 18 18/g) ?? []).length, 2);
  const large = pieSlicePath(0, 0.75);
  assert.ok(large.includes('0 1 1'));
  assert.ok(!large.includes('NaN'));
  assert.ok(pieSlicePath(0, 0.25).includes('0 0 1'));
});

test('empty scopes never query data; invalid levels and tile coordinates are rejected', async () => {
  const c = controllers();
  const parsed = c.table.parseTableQuery(new URLSearchParams({ level: 'barangay' }));
  assert.deepEqual((await c.table.loadBuildingStoryTable(parsed.query)).data, { total: 0, rows: [] });
  assert.equal((await c.summary.loadBuildingStorySummary({ level: 'barangay' }, [])).data.total, 0);
  assert.equal((await c.map.loadBuildingStoryScopeExtent([])).data, null);
  assert.equal((await c.map.loadBuildingStoryMap(-1, 0, 0, 'barangay', [])).status, 400);
  assert.equal((await c.map.loadBuildingStoryExtent('invalid', '123', [])).status, 400);
  assert.equal(c.calls.length, 0);
});

test('summary uses one query and calculates Other for sums, counts and averages', async () => {
  for (const [measure, expected] of [['sum', 70], ['count', 2], ['avg', 0]]) {
    const value = measure === 'count' ? '3' : '30';
    const c = controllers({ rows: [{ total: '100', areas: '5', items: [{ name: 'A', value }] }] });
    const result = await c.summary.loadBuildingStorySummary({ level: 'barangay', measure }, [{ scope_level: 1 }]);
    assert.equal(result.data.other, expected);
    assert.equal(result.data.items[0].value, Number(value));
    assert.equal(c.calls.length, 1);
    assert.ok(c.calls[0].sql.includes('filtered AS MATERIALIZED'));
  }
});

test('tiles and selected extents use the requested level and restrict scope', async () => {
  const c = controllers();
  const scope = [{ scope_level: 4, code: '137404' }];
  for (const level of ['region', 'province', 'municipality', 'barangay']) {
    assert.equal((await c.map.loadBuildingStoryMap(8, 215, 115, level, scope)).success, true);
    const tile = c.calls.at(-1);
    assert.ok(tile.sql.includes("'number_of_story'"));
    assert.ok(tile.sql.includes('floors_one_floor'));
    assert.ok(tile.sql.includes('b.mun_code = $4'));
    assert.equal((await c.map.loadBuildingStoryExtent(level, '123', scope)).success, true);
    assert.deepEqual(c.calls.at(-1).params, ['123', '137404']);
  }
});
