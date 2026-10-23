const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(auth = { user_id: 7, username: 'user', role: 'user' }) {
  const calls = [];
  const user = { user_id: 7, username: 'user', full_name: 'Test User', email: 'user@example.com' };
  const mocks = {
    '@/lib/db': { conn: { query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: sql.includes('FROM data.scope') ? [{ scope_id: 1, scope_level: 4, mun_code: 'PH137403000', poi: true }] : [user] };
    } } },
    '@/lib/auth/auth-service': { verifySession: async () => auth },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'session-cookie' }) }) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  };
  const modules = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
      (id) => mocks[id] ?? load((id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'),
      module, module.exports,
    );
    return module.exports;
  }
  return {
    calls, api: load('src/app/api/pages/profile/route.ts'),
    controller: load('src/lib/pages/profile/profile_controller.ts'),
  };
}
const input = { full_name: '  Test User  ', email: 'user@example.com', phone_number: '+639171234567', address: 'Pasig' };
const request = (body, site = 'same-origin') => ({ headers: new Headers({ 'sec-fetch-site': site }), json: async () => body });

test('profile endpoints reject missing sessions before accessing profile data', async () => {
  const c = setup(null);
  assert.equal((await c.api.GET()).status, 401);
  assert.equal((await c.api.PATCH(request(input))).status, 401);
  assert.equal(c.calls.length, 0);
});

test('profile reads only the session user and scopes, without selecting secrets', async () => {
  const c = setup();
  const response = await c.api.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.body.scopes.length, 1);
  assert.equal(c.calls.length, 2);
  for (const call of c.calls) {
    assert.deepEqual(call.params, [7]);
    assert.doesNotMatch(call.sql, /password_hash|\btoken\b|SELECT\s+\*/i);
  }
});

test('profile saves ignore supplied identity and privilege fields and bind contact values', async () => {
  const c = setup();
  const response = await c.api.PATCH(request({ ...input, user_id: 999, role: 'admin', status: 'active', smv: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(c.calls[0].params, [7, 'Test User', input.email, input.phone_number, 'Pasig']);
  assert.doesNotMatch(c.calls[0].sql.split('WHERE')[0], /role\s*=|status\s*=|token\s*=|password_hash\s*=/i);
});

test('invalid data and cross-site writes never reach the update query', async () => {
  const c = setup();
  for (const invalid of [{ ...input, email: 'bad' }, { ...input, full_name: '' }, { ...input, phone_number: '0917' }, { ...input, address: 'a'.repeat(501) }]) {
    assert.equal((await c.api.PATCH(request(invalid))).status, 400);
  }
  assert.equal((await c.api.PATCH(request(input, 'cross-site'))).status, 403);
  assert.equal(c.calls.length, 0);
});

test('environment administrator is readable without a database row and cannot be edited', async () => {
  const c = setup({ user_id: 0, username: 'admin', fullname: 'Admin', email: 'admin@example.com', role: 'admin' });
  const response = await c.api.GET();
  assert.equal(response.body.managedExternally, true);
  assert.equal(response.body.scopes[0].scope_level, 1);
  assert.equal((await c.api.PATCH(request(input))).status, 403);
  assert.equal(c.calls.length, 0);
});
