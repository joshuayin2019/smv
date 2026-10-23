const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function controllers(response = { rows: [] }) {
  const calls = [], cache = new Map();
  const db = { conn: { query: async (sql, params) => {
    assert.equal(Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]))), params.length);
    calls.push({ sql, params }); return response;
  } } };
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(id => id === '@/lib/db' ? db : load((id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'), module, module.exports);
    return module.exports;
  }
  return { calls, api: load('src/lib/pages/demographic/barangay_class/barangay_class_controller.ts'),
    config: load('src/lib/pages/demographic/barangay_class/barangay_class_config.ts') };
}

test('only U and R have recognized labels; all other values are Unknown', () => {
  const { config } = controllers();
  assert.equal(config.classLabel('U'), 'Urban'); assert.equal(config.classLabel('R'), 'Rural');
  for (const value of ['', 'u', 'r', ' U ', null, undefined, 'X']) assert.equal(config.classLabel(value), 'Unknown');
  assert.ok(config.CLASS_SQL.includes("ELSE 'Unknown'"));
  assert.ok(!config.CLASS_SQL.includes('UPPER'));
});

test('table, summary and tiles share strict classification and retain unmatched boundaries', async () => {
  const c = controllers();
  const parsed = c.api.parseClassQuery(new URLSearchParams({ scope: JSON.stringify([{ scope_level: 4, code: '137404' }]), classification: 'Unknown', search: "Pasig%_", sort: 'urban_rural', dir: 'desc', pageSize: '25', page: '2' }));
  assert.equal(parsed.ok, true);
  await c.api.loadClassTable(parsed.query);
  await c.api.loadClassSummary(parsed.query);
  assert.equal((await c.api.loadBarangayClassMap(8, 215, 115, 'barangay', parsed.query.scope)).success, true);
  for (const call of c.calls) {
    assert.ok(call.sql.includes(c.config.CLASS_SQL));
    assert.ok(call.sql.includes('LEFT JOIN data.psa_2020'));
  }
  assert.ok(c.calls[0].params.includes('Unknown'));
  assert.ok(c.calls[0].params.includes('%Pasig\\%\\_%'));
  assert.deepEqual(c.calls[0].params.slice(-2), [25, 25]);
  assert.ok(c.calls[0].sql.includes('urban_rural DESC NULLS LAST'));
});

test('invalid scopes are rejected and empty access never queries data', async () => {
  const c = controllers();
  assert.equal(c.api.parseClassQuery(new URLSearchParams({ scope: '[null]' })).ok, false);
  const parsed = c.api.parseClassQuery(new URLSearchParams({ sort: 'name; DROP TABLE x' }));
  assert.equal(parsed.query.sort, 'name');
  assert.equal((await c.api.loadClassTable(parsed.query)).total, 0);
  assert.equal((await c.api.loadClassSummary(parsed.query)).length, 0);
  assert.equal((await c.api.loadBarangayClassMap(8, 215, 115, 'barangay', [])).data, null);
  assert.equal((await c.api.loadBarangayClassMap(8, 215, 115, 'municipality', [])).status, 400);
  assert.equal(c.calls.length, 0);
});

test('map selection locates the correct table page under the same filters', async () => {
  const c = controllers({ rows: [{ rn: '26' }] });
  const parsed = c.api.parseClassQuery(new URLSearchParams({ scope: '[{"scope_level":1}]', pageSize: '25', classification: 'U' }));
  assert.deepEqual(await c.api.locateClass(parsed.query, '123'), { found: true, page: 2 });
  assert.ok(c.calls[0].sql.includes('ROW_NUMBER()'));
  assert.deepEqual(c.calls[0].params, ['U', '123']);
});
