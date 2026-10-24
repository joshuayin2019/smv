const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(auth = { scope_parcel: [{ scope_level: 4, code: 'PH133901000' }] }, position = '29') {
  const calls = [], cache = new Map();
  const mocks = {
    '@/lib/db': { conn: { query: async (sql, params) => {
      calls.push({ sql,params });
      assert.equal(Math.max(0,...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]))), params.length);
      if (sql.includes('AS classifications')) return { rows: [{ total: 41, classifications: [{ name: 'residential',value: '41' }],bounds: [120,14,121,15] }] };
      if (sql.includes('WITH ranked')) return { rows: [{ position }] };
      if (sql.includes('ORDER BY value DESC,name')) return { rows: [{ name: 'Residential',value: '30' },{ name: 'Commercial',value: '11' }] };
      if (sql.includes('ST_AsMVT(')) return { rows: [{ tile: Buffer.from('tile') }] };
      return { rows: [{ id: '7',parcel_id: 'TEST',bounds: [120,14,121,15] }] };
    } } },
    '@/lib/pages/parcel/parcel_session': { parcelSession: async () => auth },
    'next/server': { connection: async () => {}, NextResponse: class {
      constructor(body, options = {}) { this.body = body; Object.assign(this,options); }
      static json(body, options) { return new this(body,options); }
    } },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const m = { exports: {} }; cache.set(file,m);
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(id => mocks[id] ?? load((id.startsWith('@/') ? path.resolve('src',id.slice(2)) : path.resolve(path.dirname(file),id))+'.ts'),m,m.exports);
    return m.exports;
  }
  return { calls,load,api: load('src/lib/pages/parcel/parcel_controller.ts') };
}
const scope = [{ scope_level: 4,code: 'PH133901000' }];

test('no parcel scope returns empty data and tiles without queries', async () => {
  const c = setup();
  assert.equal((await c.api.loadParcels([],new URLSearchParams())).total,0);
  assert.equal(await c.api.loadParcel([],'7'),null);
  assert.equal((await c.api.parcelTile([],new URLSearchParams(),14,1,1)).length,0);
  assert.equal(c.calls.length,0);
});

test('filters bind scope, escaped search and classification, and clamp pagination', async () => {
  const c = setup();
  const result = await c.api.loadParcels(scope,new URLSearchParams({ search: "x%' OR true --",classification: 'Residential',page: '999999' }));
  assert.equal(result.page,3);
  assert.equal(result.pageSize,20);
  assert.match(c.calls[0].sql,/b.mun_code = \$1/);
  assert.equal(c.calls[0].params[0],scope[0].code);
  assert.equal(c.calls[0].params[2],'residential');
  assert.ok(c.calls[0].params[1].includes('\\%'));
  assert.doesNotMatch(c.calls[0].sql,/OR true --/);
  assert.equal(c.calls[1].params.at(-1),40);
  assert.equal(result.classifications[0].value,41);
});

test('summary cache is shared across pages and explicit refresh reruns it', async () => {
  const c = setup();
  await c.api.loadParcels(scope,new URLSearchParams());
  await c.api.loadParcels(scope,new URLSearchParams({ page: '2' }));
  assert.equal(c.calls.filter(c => c.sql.includes('AS classifications')).length,1);
  await c.api.loadParcels(scope,new URLSearchParams({ refresh: '1' }));
  assert.equal(c.calls.filter(c => c.sql.includes('AS classifications')).length,2);
});

test('detail and tiles retain scope and projected spatial index filtering', async () => {
  const c = setup();
  assert.equal(await c.api.loadParcel(scope,'bad'),null);
  await c.api.loadParcel(scope,'7');
  assert.deepEqual(c.calls[0].params,[scope[0].code,'7']);
  assert.equal((await c.api.parcelTile(scope,new URLSearchParams(),11,1,1)).length,0);
  await c.api.parcelTile(scope,new URLSearchParams({ classification: 'Residential' }),14,1,2);
  assert.match(c.calls[1].sql,/b.geom_3857 && env.margin/);
  assert.deepEqual(c.calls[1].params,[scope[0].code,'residential',14,1,2]);
});

test('parcel routes reject unauthenticated access before querying', async () => {
  const c = setup(null);
  const route = c.load('src/app/api/pages/parcel/route.ts');
  assert.equal((await route.GET(new Request('http://localhost/api/pages/parcel'))).status,401);
  const tiles = c.load('src/app/api/pages/parcel/tiles/[z]/[x]/[y]/route.ts');
  assert.equal((await tiles.GET(new Request('http://localhost'),{ params: Promise.resolve({ z: '14',x: '1',y: '2' }) })).status,401);
  assert.equal(c.calls.length,0);
});

test('parcel tile coordinates are validated and client scope cannot broaden access', async () => {
  const c = setup();
  const route = c.load('src/app/api/pages/parcel/route.ts');
  await route.GET(new Request('http://localhost/api/pages/parcel?scope=[{"scope_level":1}]'));
  assert.equal(c.calls[0].params[0],scope[0].code);
  const tiles = c.load('src/app/api/pages/parcel/tiles/[z]/[x]/[y]/route.ts');
  assert.equal((await tiles.GET(new Request('http://localhost'),{ params: Promise.resolve({ z: '14',x: '999999',y: '2' }) })).status,400);
});

test('parcel table adapts page size and sorts only by whitelisted columns', async () => {
  const c = setup();
  const data = await c.api.loadParcels(scope,new URLSearchParams({ pageSize: '7',page: '3',sort: 'classification',direction: 'desc' }));
  assert.equal(data.pageSize,7);
  assert.match(c.calls.at(-1).sql,/ORDER BY b.classification DESC NULLS LAST, b.id ASC LIMIT 7/);
  assert.equal(c.calls.at(-1).params.at(-1),14);
  await c.api.loadParcels(scope,new URLSearchParams({ sort: 'id; DROP TABLE data.parcel',direction: 'bad' }));
  assert.match(c.calls.at(-1).sql,/ORDER BY b.parcel_name ASC/);
});

test('parcel chart groups database results and merges the remaining groups', async () => {
  const c = setup();
  const data = await c.api.parcelSummary(scope,new URLSearchParams({ groupBy: 'barangay',limit: '1',classification: 'Residential' }));
  assert.deepEqual(data,{ items: [{ name: 'Residential',value: 30 }],other: 11,total: 41 });
  assert.match(c.calls[0].sql,/btrim\(b.bgy_name\)/);
  assert.deepEqual(c.calls[0].params,[scope[0].code,'residential']);
  const empty = await c.api.parcelSummary([],new URLSearchParams());
  assert.equal(empty.total,0);
  assert.equal(c.calls.length,1);
});

test('selection page follows the table sort, page size, scope and filters', async () => {
  const c = setup();
  const result = await c.api.locateParcel(scope,new URLSearchParams({ sort: 'classification',direction: 'desc',pageSize: '7',classification: 'Residential' }),'7');
  assert.deepEqual(result,{ found: true,reachable: true,page: 5 });
  assert.match(c.calls[0].sql,/ORDER BY b.classification DESC NULLS LAST,b.id ASC/);
  assert.deepEqual(c.calls[0].params,[scope[0].code,'residential','7']);
  assert.equal((await c.api.locateParcel([],new URLSearchParams(),'7')).found,false);
});

test('selection beyond browsing limit does not navigate to a false page', async () => {
  const c = setup(undefined,null);
  assert.deepEqual(await c.api.locateParcel(scope,new URLSearchParams(),'7'),{ found: true,reachable: false,page: null });
});
