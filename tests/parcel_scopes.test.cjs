const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ user_id: 'sample' }], rowCount: 1 };
    },
    release() {},
  };
  const mocks = {
    '@/lib/db': { conn: { ...client, connect: async () => client } },
    bcryptjs: { hash: async () => 'hash' },
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  };
  const modules = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true,
    } }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
      id => mocks[id] ?? load((id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'), module, module.exports);
    return module.exports;
  }
  return { calls, load, controller: load('src/lib/pages/users_management/users_management_controller.ts') };
}

const user = { username: 'sample', email: 's@example.com', password: 'example', full_name: 'Sample', phone_number: '+639171234567', address: 'Sample', status: 'active' };
const scope = { scope_level: 2, reg_code: 'PH130000000', pro_code: null, mun_code: null, poi: false, smv: false, psa: false, parcel: true };

test('creation explicitly saves enabled and disabled parcel access', async () => {
  for (const enabled of [true, false]) {
    const c = setup();
    await c.controller.createUser(user, [{ ...scope, scope_level: 'region' }], enabled ? ['Parcel'] : ['POI']);
    const insert = c.calls.find(call => call.sql.includes('INSERT INTO data.scope'));
    assert.match(insert.sql, /psa, parcel/);
    assert.equal(insert.params.length, 9);
    assert.equal(insert.params[8], enabled);
  }
});

test('scope API accepts parcel-only scopes and preserves the flag on update', async () => {
  const c = setup();
  const api = c.load('src/app/api/pages/users_management/[id]/scope/route.ts');
  const response = await api.PUT({ json: async () => ({ scopes: [scope] }) }, { params: Promise.resolve({ id: '1' }) });
  assert.equal(response.body.success, true);
  const insert = c.calls.find(call => call.sql.includes('INSERT INTO data.scope'));
  assert.deepEqual(insert.params.slice(5), [false, false, false, true]);
});

test('parcel scopes appear in normalized user cards and searches', () => {
  const c = setup();
  const utils = c.load('src/components/pages/user_management/users.utils.ts');
  const normalized = utils.normalizeUser({ ...user, id: 1, scope_parcel: [{ scope_level: 2, code: 'NCR' }] });
  assert.deepEqual(normalized.scopes, [{ type: 'parcel', scope_level: 2, code: 'NCR' }]);
  assert.equal(utils.searchUsers([normalized], 'parcel NCR').length, 1);
});
