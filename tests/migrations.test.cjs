const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseArgs, readMigrations } = require('../database/migrate.cjs');

test('migration runner requires an explicit database except for offline checks', () => {
  assert.throws(() => parseArgs([]), /Specify a target/);
  assert.throws(() => parseArgs(['--database', '--create']), /Specify a target/);
  assert.equal(parseArgs(['--check']).check, true);
  assert.deepEqual(parseArgs(['--database', 'smv_new', '--create']), { database: 'smv_new', create: true, check: false });
});

test('initial migration preserves exported structure with compatibility fixes and parcel scope', () => {
  const migration = readMigrations()[0];
  assert.match(migration.sql, /CREATE SCHEMA core;/);
  assert.match(migration.sql, /CREATE SCHEMA data;/);
  assert.match(migration.sql, /CREATE SCHEMA lookup;/);
  assert.doesNotMatch(migration.sql, /^\\|^SET transaction_timeout/m);
  if (fs.existsSync('_database_backup/schema.sql')) {
    const expected = fs.readFileSync('_database_backup/schema.sql', 'utf8')
      .replace(/^\\(?:un)?restrict[^\r\n]*\r?\n/gm, '')
      .replace(/^SET transaction_timeout = 0;\r?\n/gm, '').replaceAll('\r\n', '\n')
      .replace('    psa boolean DEFAULT true,\n', '    psa boolean DEFAULT true,\n    parcel boolean DEFAULT true,\n');
    assert.equal(migration.sql, expected);
  }
});

function mockRunner({ applied, fail = false } = {}) {
  const calls = [];
  class Client {
    async connect() {}
    async end() { calls.push('end'); }
    async query(sql, params) {
      calls.push(sql);
      if (sql.startsWith('SELECT checksum')) {
        const checksum = applied === 'all' ? readMigrations().find(m => m.name === params[0]).checksum : applied;
        return { rowCount: checksum ? 1 : 0, rows: checksum ? [{ checksum }] : [] };
      }
      if (fail && sql.includes('CREATE TABLE core.brgy_bndry')) throw new Error('mock SQL failure');
      return { rows: [], rowCount: 0 };
    }
  }
  const module = { exports: {} };
  const source = fs.readFileSync('database/migrate.cjs', 'utf8');
  const fakeRequire = id => id === 'pg' ? { Client } : id === '@next/env' ? { loadEnvConfig() {} } : require(id);
  vm.runInNewContext(source, { require: fakeRequire, module, __dirname: require('node:path').resolve('database'), Buffer,
    console: { log() {} }, process: { env: { PGSQL_HOST: 'localhost', PGSQL_USER: 'test', PGSQL_PASSWORD: 'test' } } });
  return { calls, run: module.exports.run };
}

test('runner commits successful migrations and skips tracked migrations', async () => {
  const fresh = mockRunner();
  await fresh.run(['--database', 'test']);
  assert.ok(fresh.calls.includes('COMMIT'));
  assert.ok(fresh.calls.some(sql => sql.startsWith('INSERT INTO smv_migrations.history')));
  const existing = mockRunner({ applied: 'all' });
  await existing.run(['--database', 'test']);
  assert.ok(!existing.calls.includes('BEGIN'));
});

test('runner rolls back SQL failures and rejects modified applied migrations', async () => {
  const failed = mockRunner({ fail: true });
  await assert.rejects(failed.run(['--database', 'test']), /rolled back/);
  assert.ok(failed.calls.includes('ROLLBACK'));
  assert.ok(!failed.calls.includes('COMMIT'));
  assert.equal(failed.calls.at(-1), 'end');
  const changed = mockRunner({ applied: 'wrong checksum' });
  await assert.rejects(changed.run(['--database', 'test']), /Applied migration changed/);
});
