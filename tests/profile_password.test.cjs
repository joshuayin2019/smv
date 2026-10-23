const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const bcrypt = require('bcryptjs');

function setup({ auth = { user_id: 7, role: 'user' }, conflict = false } = {}) {
  const calls = [], deleted = [];
  const oldHash = bcrypt.hashSync('old-password', 4);
  const mocks = {
    bcryptjs: { default: bcrypt },
    '@/lib/db': { conn: { query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: sql.startsWith('SELECT') ? [{ password_hash: oldHash }] : conflict ? [] : [{ user_id: 7 }] };
    } } },
    '@/lib/auth/auth-service': { verifySession: async () => auth },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'cookie' }), delete: (name) => deleted.push(name) }) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  };
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
      (id) => mocks[id] ?? load((id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(filename), id)) + '.ts'), module, module.exports,
    );
    return module.exports;
  }
  return { calls, deleted, oldHash, api: load('src/app/api/pages/profile/password/route.ts'),
    validation: load('src/lib/pages/profile/profile_types.ts'), phone: load('src/components/pages/user_management/form_utils.ts') };
}
const input = { current_password: 'old-password', new_password: 'new-password', confirm_password: 'new-password' };
const request = (body, site = 'same-origin') => ({ headers: new Headers({ 'sec-fetch-site': site }), json: async () => body });

test('password update hashes the new password for the session account and revokes sessions', async () => {
  const c = setup();
  const response = await c.api.POST(request({ ...input, user_id: 999 }));
  assert.equal(response.status, 200);
  const update = c.calls[1];
  assert.equal(update.params[0], 7);
  assert.equal(await bcrypt.compare(input.new_password, update.params[1]), true);
  assert.equal(update.params[2], c.oldHash);
  assert.match(update.sql, /token = NULL/);
  assert.match(update.sql, /password_hash = \$3/);
  assert.deepEqual(c.deleted, ['token']);
  assert.doesNotMatch(JSON.stringify(response.body), /new-password|old-password|\$2[aby]\$/);
});

test('incorrect current password never writes or deletes the session cookie', async () => {
  const c = setup();
  assert.equal((await c.api.POST(request({ ...input, current_password: 'wrong' }))).status, 400);
  assert.equal(c.calls.length, 1);
  assert.deepEqual(c.deleted, []);
});

test('unauthenticated, environment admin, and cross-site requests cannot change passwords', async () => {
  for (const [auth, status] of [[null, 401], [{ user_id: 0, role: 'admin' }, 403]]) {
    const c = setup({ auth });
    assert.equal((await c.api.POST(request(input))).status, status);
    assert.equal(c.calls.length, 0);
  }
  const c = setup();
  assert.equal((await c.api.POST(request(input, 'cross-site'))).status, 403);
  assert.equal(c.calls.length, 0);
});

test('mismatched, short, unchanged, and over-72-byte passwords fail before database access', async () => {
  const c = setup();
  for (const change of [
    { confirm_password: 'different' }, { new_password: 'short', confirm_password: 'short' },
    { new_password: 'old-password', confirm_password: 'old-password' },
    { new_password: 'é'.repeat(37), confirm_password: 'é'.repeat(37) },
  ]) assert.equal((await c.api.POST(request({ ...input, ...change }))).status, 400);
  assert.equal(c.calls.length, 0);
});

test('concurrent password change does not report success or delete the cookie', async () => {
  const c = setup({ conflict: true });
  assert.equal((await c.api.POST(request(input))).status, 400);
  assert.deepEqual(c.deleted, []);
});

test('phone input strips letters, limits digits, accepts pasted local/international numbers, and validates on server', () => {
  const c = setup();
  assert.equal(c.phone.cleanPhone('abc171x234567!'), '171234567');
  assert.equal(c.phone.cleanPhone('+639171234567'), '171234567');
  assert.equal(c.phone.cleanPhone('09171234567'), '171234567');
  assert.equal(c.phone.cleanPhone('171234567890'), '171234567');
  const profile = { full_name: 'User', email: 'user@example.com', address: '', phone_number: '+639171234567' };
  assert.equal(c.validation.validateProfile(profile).phone_number, profile.phone_number);
  for (const phone_number of ['+63917123456a', '+63917123456', '+6391712345678']) {
    assert.throws(() => c.validation.validateProfile({ ...profile, phone_number }));
  }
});
