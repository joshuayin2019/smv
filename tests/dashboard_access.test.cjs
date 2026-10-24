const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(auth) {
  const calls = [];
  const mocks = {
    'next/server': { connection: async () => {}, NextResponse: { json: (body, options) => ({ body, ...options }) } },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'session' }) }) },
    '@/lib/auth/auth-service': { verifySession: async () => auth },
    '@/lib/pages/dashboard/dashboard_controller': { loadDashboard: async scopes => { calls.push(scopes); return { parcel: { total: 20 } }; } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/pages/dashboard/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(id => mocks[id], module, module.exports);
  return { calls, api: module.exports };
}

test('dashboard rejects requests without a valid session', async () => {
  const c = setup(null);
  assert.equal((await c.api.GET()).status, 401);
  assert.equal(c.calls.length, 0);
});

test('dashboard uses session scopes even when broader scopes are supplied in the URL', async () => {
  const parcel = [{ scope_level: 4, code: 'PH133901000' }];
  const c = setup({ scope_parcel: parcel, scope_smv: [], scope_poi: [], scope_psa: [] });
  await c.api.GET(new Request('http://localhost/api/pages/dashboard?scopes=' + encodeURIComponent(JSON.stringify({ parcel: [{ scope_level: 1, code: null }] }))));
  assert.deepEqual(c.calls[0], { parcel, smv: [], poi: [], psa: [] });
});
