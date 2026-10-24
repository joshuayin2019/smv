const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { loadEnvConfig } = require('@next/env');

const root = path.resolve(__dirname, '..');

function parseArgs(args) {
  const options = { create: false, check: false, database: '' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--database') options.database = args[++i] || '';
    else if (args[i] === '--create') options.create = true;
    else if (args[i] === '--check') options.check = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!options.check && (!options.database || options.database.startsWith('--'))) {
    throw new Error('Specify a target: node database/migrate.cjs --database smv_new [--create]');
  }
  if (Buffer.byteLength(options.database) > 63 || options.database.includes('\0')) throw new Error('Invalid database name');
  return options;
}

function readMigrations() {
  return fs.readdirSync(path.join(__dirname, 'migrations')).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort().map(name => {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', name), 'utf8');
    if (/^\s*\\/m.test(sql)) throw new Error(`${name}: psql commands are not supported`);
    return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  });
}

async function run(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const migrations = readMigrations();
  if (!migrations.length) throw new Error('No SQL migrations found');
  if (options.check) {
    for (const migration of migrations) console.log(`${migration.name}: ${migration.checksum}`);
    console.log('Migration files checked; no database connection made.');
    return;
  }
  loadEnvConfig(root);
  const config = {
    host: process.env.PGSQL_HOST,
    port: Number(process.env.PGSQL_PORT || 5432),
    user: process.env.PGSQL_USER,
    password: process.env.PGSQL_PASSWORD,
  };
  if (!config.host || !config.user || config.password === undefined) throw new Error('Set PGSQL_HOST, PGSQL_USER and PGSQL_PASSWORD in .env');
  if (options.create) {
    const admin = new Client({ ...config, database: 'postgres' });
    await admin.connect();
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [options.database]);
      if (!exists.rowCount) {
        await admin.query(`CREATE DATABASE "${options.database.replaceAll('"', '""')}" TEMPLATE template0`);
        console.log(`Created database ${options.database}`);
      }
    } finally { await admin.end(); }
  }
  const client = new Client({ ...config, database: options.database });
  await client.connect();
  try {
    console.log(`Migration target: ${config.host}:${config.port}/${options.database}`);
    await client.query("SELECT pg_advisory_lock(739214, 1)");
    await client.query('CREATE SCHEMA IF NOT EXISTS smv_migrations');
    await client.query(`CREATE TABLE IF NOT EXISTS smv_migrations.history (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const applied = await client.query('SELECT checksum FROM smv_migrations.history WHERE name = $1', [migration.name]);
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== migration.checksum) throw new Error(`Applied migration changed: ${migration.name}. Add a new migration instead.`);
        console.log(`Skipped ${migration.name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO smv_migrations.history (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
        await client.query('COMMIT');
        console.log(`Applied ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${migration.name} rolled back: ${error.message}`, { cause: error });
      }
    }
    console.log('Migrations complete.');
  } finally {
    // Closing the session also releases its advisory lock, even after a failure.
    await client.end();
  }
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs, readMigrations, run };
