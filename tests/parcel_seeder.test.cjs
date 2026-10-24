const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseArgs } = require('../database/seeders/parcel_id.cjs');

test('parcel seeder defaults to 20 and requires an explicit target', () => {
  assert.throws(() => parseArgs([]), /database/);
  assert.equal(parseArgs(['--database', 'sample']).count, 20);
  assert.equal(parseArgs(['--database', 'sample']).roadClearance,12);
  assert.equal(parseArgs(['--database', 'sample','--road-clearance','15']).roadClearance,15);
  for (const clearance of ['0','-1','NaN','101']) assert.throws(() => parseArgs(['--database','sample','--road-clearance',clearance]),/road-clearance/);
  for (const count of ['0', '-1', 'NaN', '1.5', '10001']) {
    assert.throws(() => parseArgs(['--database', 'sample', '--count', count]), /count/);
  }
});

function fixture({ verified = 20, invalid = false, overlaps = false, failFirst = false, legacy = 0, failAttempts = 0 } = {}) {
  const calls = [];
  const attempts = [];
  let verifications = 0;
  class Client {
    async connect() {}
    async end() { calls.push('END SESSION'); }
    async query(sql,params) {
      calls.push(sql);
      if (sql.includes('INSERT INTO')) attempts.push(params[5]);
      if (sql.includes('AS usable')) return { rows: [{ id: 1, bgy_code: '137401001', bgy_name: 'Sample', usable: !invalid }] };
      if (sql.includes('AS legacy_count')) return { rows: [{ legacy_count: legacy }] };
      if (sql.includes('AS count')) {
        const number = verifications++;
        return { rows: [{ count: (failFirst && number === 0) || number < failAttempts ? 19 : verified }] };
      }
      if (sql.includes('AS overlaps')) return { rows: [{ overlaps }] };
      return { rows: [], rowCount: 20 };
    }
  }
  const module = { exports: {} };
  const fakeRequire = id => id === 'pg' ? { Client } : id === '@next/env' ? { loadEnvConfig() {} } : require(id);
  vm.runInNewContext(fs.readFileSync('database/seeders/parcel_id.cjs', 'utf8'), {
    require: fakeRequire, module, __dirname: path.resolve('database/seeders'),
    process: { env: {} }, console: { log() {} },
  });
  return { calls, attempts, run: module.exports.run };
}

test('preview does not begin transactions or insert parcels', async () => {
  const f = fixture();
  await f.run(['--database', 'sample', '--preview']);
  assert.ok(!f.calls.includes('BEGIN'));
  assert.ok(!f.calls.some(sql => sql.includes('INSERT INTO')));
});

test('verified barangays commit, incomplete results roll back', async () => {
  const success = fixture();
  await success.run(['--database', 'sample']);
  assert.ok(success.calls.includes('COMMIT'));
  const failed = fixture({ verified: 19 });
  await assert.rejects(failed.run(['--database', 'sample']), /Could not verify/);
  assert.ok(failed.calls.includes('ROLLBACK'));
  assert.ok(!failed.calls.includes('COMMIT'));
  assert.equal(failed.calls.at(-1), 'END SESSION');
});

test('invalid boundaries fail before inserting', async () => {
  const f = fixture({ invalid: true });
  await assert.rejects(f.run(['--database', 'sample']), /Invalid boundary/);
  assert.ok(!f.calls.includes('BEGIN'));
});

test('overlapping interiors roll back instead of committing', async () => {
  const f = fixture({ overlaps: true });
  await assert.rejects(f.run(['--database', 'sample']), /Overlapping parcel interiors/);
  assert.ok(f.calls.includes('ROLLBACK'));
  assert.ok(!f.calls.includes('COMMIT'));
});

test('an incomplete first partition rolls back and a valid retry commits', async () => {
  const f = fixture({ failFirst: true });
  await f.run(['--database', 'sample']);
  assert.equal(f.calls.filter(sql => sql === 'ROLLBACK').length, 1);
  assert.equal(f.calls.filter(sql => sql === 'BEGIN').length, 2);
  assert.equal(f.calls.filter(sql => sql === 'COMMIT').length, 1);
});

test('old large synthetic samples are detected before any inserts', async () => {
  const f = fixture({ legacy: 20 });
  await assert.rejects(f.run(['--database','sample']),/Old large synthetic parcels/);
  assert.ok(!f.calls.includes('BEGIN'));
  assert.ok(!f.calls.some(sql => sql.includes('INSERT INTO')));
});

test('crowded barangays retry with a larger candidate pool and compact size mode', async () => {
  const f = fixture({ failAttempts: 2 });
  await f.run(['--database','sample']);
  assert.deepEqual(f.attempts,[0,1,2]);
  assert.equal(f.calls.filter(s => s === 'ROLLBACK').length,2);
  assert.equal(f.calls.filter(s => s === 'COMMIT').length,1);
});
