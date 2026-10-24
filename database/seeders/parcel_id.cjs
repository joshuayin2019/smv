const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('pg');
const { loadEnvConfig } = require('@next/env');

const SOURCE = 'synthetic-ncr-parcels-v3';
const MAX_ATTEMPTS = 8;
const NCR = `(btrim(reg_code) ~ '^13[0]*$'
  OR upper(btrim(reg_name)) IN ('NCR', 'NATIONAL CAPITAL REGION', 'NATIONAL CAPITAL REGION (NCR)'))`;

function parseArgs(args) {
  const options = {
    database: '',
    count: 20,              // target (maximum) parcels per barangay
    min: 10,                // minimum acceptable parcels per barangay
    preview: false,
    roadClearance: 12,      // preferred clearance from mapped roads (metres)
    minRoadClearance: 4,    // lowest clearance allowed when a barangay is hard to fill
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--database') options.database = args[++i] || '';
    else if (args[i] === '--count') options.count = Number(args[++i]);
    else if (args[i] === '--min') options.min = Number(args[++i]);
    else if (args[i] === '--road-clearance') options.roadClearance = Number(args[++i]);
    else if (args[i] === '--min-road-clearance') options.minRoadClearance = Number(args[++i]);
    else if (args[i] === '--preview') options.preview = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!options.database || options.database.startsWith('--')) throw new Error('Specify --database YOUR_DATABASE');
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 10000) throw new Error('--count must be an integer from 1 to 10000');
  if (!Number.isInteger(options.min) || options.min < 1 || options.min > options.count) throw new Error('--min must be an integer from 1 to --count');
  if (!Number.isFinite(options.roadClearance) || options.roadClearance < 1 || options.roadClearance > 100) throw new Error('--road-clearance must be between 1 and 100 metres');
  if (!Number.isFinite(options.minRoadClearance) || options.minRoadClearance < 1 || options.minRoadClearance > options.roadClearance) throw new Error('--min-road-clearance must be between 1 and --road-clearance');
  return options;
}

// Clearance used for a given attempt. Attempts 0-1 use the preferred clearance;
// later attempts step down gradually to the minimum so crowded barangays can still be filled.
function clearanceForAttempt(options, attempt) {
  if (attempt < 2) return options.roadClearance;
  const fraction = Math.min(1, (attempt - 1) / (MAX_ATTEMPTS - 2));
  const value = options.roadClearance - (options.roadClearance - options.minRoadClearance) * fraction;
  return Math.round(value * 10) / 10;
}

// Generate compact synthetic rectangles in metres, outside mapped road corridors.
// Greedy selection keeps rectangle interiors separate rather than filling land.
const INSERT_SQL = `WITH RECURSIVE boundary AS MATERIALIZED (
  SELECT b.*, public.ST_Transform(b.geom,32651) AS metric_geom
  FROM core.brgy_bndry b WHERE b.id = $1
), road_mask AS MATERIALIZED (
  SELECT public.ST_Union(public.ST_Buffer(public.ST_Transform(r.geom,32651),$5::float8+1) ORDER BY r.id) AS geom
  FROM boundary b JOIN data.smv r
    ON r.geom && public.ST_Expand(b.geom,($5::float8+30)/90000.0)
  WHERE r.geom IS NOT NULL AND NOT public.ST_IsEmpty(r.geom)
), occupied AS MATERIALIZED (
  SELECT public.ST_Union(public.ST_Transform(p.geom,32651) ORDER BY p.id) AS geom
  FROM boundary b JOIN data.parcel p ON p.geom && b.geom
  WHERE NOT (p.source IS NOT DISTINCT FROM $4::text
    AND btrim(p.bgy_code) IS NOT DISTINCT FROM btrim(b.bgy_code))
), available AS MATERIALIZED (
  SELECT b.*, public.ST_CollectionExtract(public.ST_MakeValid(public.ST_Difference(
    public.ST_Difference(metric_geom,COALESCE(r.geom,public.ST_GeomFromText('POLYGON EMPTY',32651))),
    COALESCE(o.geom,public.ST_GeomFromText('POLYGON EMPTY',32651))
  )),3) AS free_geom FROM boundary b CROSS JOIN road_mask r CROSS JOIN occupied o
), points AS MATERIALIZED (
  SELECT a.*, d.path[1] AS candidate_id,d.geom AS point
  FROM available a CROSS JOIN LATERAL public.ST_DumpPoints(public.ST_GeneratePoints(
    a.free_geom,LEAST(200000,GREATEST(2000,$2::integer*100) * (1+$6::integer*2)),$3::integer)) d
  WHERE NOT public.ST_IsEmpty(a.free_geom)
), rectangles AS MATERIALIZED (
  SELECT *, public.ST_MakeEnvelope(
    public.ST_X(point)-w/2,public.ST_Y(point)-h/2,
    public.ST_X(point)+w/2,public.ST_Y(point)+h/2,32651) AS rectangle
  FROM points CROSS JOIN LATERAL (SELECT
    CASE WHEN $6::integer >= 2 THEN 8.0 ELSE 8.0+(('x'||substr(md5($3::text||':'||candidate_id||':w'),1,7))::bit(28)::bigint % 7) END AS w,
    CASE WHEN $6::integer >= 2 THEN 8.0 ELSE 8.0+(('x'||substr(md5($3::text||':'||candidate_id||':h'),1,7))::bit(28)::bigint % 11) END AS h
  ) dimensions
), candidates AS MATERIALIZED (
  SELECT candidate_id,rectangle,public.ST_Multi(public.ST_Transform(rectangle,4326)) AS parcel_geom
  FROM rectangles
  WHERE public.ST_CoveredBy(rectangle,free_geom)
    AND public.ST_CoveredBy(public.ST_Transform(rectangle,4326),geom)
), picked(n,last_id,used,parcel_geom) AS (
  SELECT 0,0,public.ST_GeomFromText('POLYGON EMPTY',32651),public.ST_GeomFromText('MULTIPOLYGON EMPTY',4326)
  UNION ALL
  SELECT p.n+1,c.candidate_id,public.ST_Collect(p.used,c.rectangle),c.parcel_geom
  FROM picked p CROSS JOIN LATERAL (
    SELECT * FROM candidates c WHERE c.candidate_id > p.last_id
      AND NOT public.ST_Intersects(c.rectangle,p.used)
    ORDER BY c.candidate_id LIMIT 1
  ) c WHERE p.n < $2::integer
), ready AS MATERIALIZED (
  SELECT b.*,p.n,p.parcel_geom FROM picked p CROSS JOIN boundary b WHERE p.n > 0
)
INSERT INTO data.parcel (
  parcel_id,geom,parcel_name,classification,
  reg_code,reg_name,pro_code,pro_name,mun_code,mun_name,bgy_code,bgy_name,
  address,source,remarks
)
SELECT 'SYN-NCR-'||btrim(bgy_code)||'-'||lpad(n::text,5,'0'),parcel_geom,
  'Synthetic parcel '||n||' - '||bgy_name,
  (ARRAY['Residential','Commercial','Agricultural','Industrial'])[1+((n-1+$3::integer % 4) % 4)],
  reg_code,reg_name,pro_code,pro_name,mun_code,mun_name,bgy_code,bgy_name,
  concat_ws(', ',bgy_name,mun_name,pro_name,reg_name),$4,
  'Synthetic building-sized rectangle, not an actual building footprint or cadastral record. Mapped road centerline clearance: '||$5::text||' metres.'
FROM ready
WHERE NOT public.ST_IsEmpty(parcel_geom) AND public.ST_IsValid(parcel_geom)
ON CONFLICT (parcel_id) DO NOTHING`;

// Counts seeded parcels (ids 1..$2) for one barangay that are valid, inside the boundary and building-sized.
const VERIFY_SQL = `SELECT count(*)::integer AS count
  FROM generate_series(1, $2::integer) s(n)
  JOIN data.parcel p ON p.parcel_id = 'SYN-NCR-' || $3 || '-' || lpad(s.n::text, 5, '0')
  JOIN core.brgy_bndry b ON b.id = $1
  WHERE p.source = $4 AND btrim(p.bgy_code) = $3
    AND p.classification IN ('Residential','Commercial','Agricultural','Industrial')
    AND NOT public.ST_IsEmpty(p.geom) AND public.ST_IsValid(p.geom)
    AND public.ST_CoveredBy(p.geom, b.geom)
    AND public.ST_Area(public.ST_Transform(p.geom,32651)) BETWEEN 63.9 AND 252.1`;

// Removes partial/invalid leftovers from this seeder so a barangay can be regenerated cleanly.
const DELETE_SEEDED_SQL = `DELETE FROM data.parcel
  WHERE source = $1 AND btrim(bgy_code) = $2
    AND parcel_id LIKE 'SYN-NCR-' || $2 || '-%'`;

// True if seeded parcels overlap any other parcel interior, or sit closer than $3 metres to a mapped road.
const OVERLAP_SQL = `SELECT EXISTS (
  SELECT 1 FROM data.parcel p JOIN data.parcel q
    ON p.id <> q.id AND p.geom && q.geom
  WHERE p.source = $1 AND btrim(p.bgy_code) = $2
    AND public.ST_Relate(p.geom, q.geom, '2********')
) OR EXISTS (
  SELECT 1 FROM data.parcel p JOIN data.smv r
    ON r.geom && public.ST_Expand(p.geom,($3::float8+30)/90000.0)
  WHERE p.source = $1 AND btrim(p.bgy_code) = $2
    AND public.ST_DWithin(public.ST_Transform(p.geom,32651),public.ST_Transform(r.geom,32651),$3::float8)
) AS overlaps`;

async function seedBarangay(client, b, options) {
  const code = b.bgy_code.trim();
  let lastReason = 'unknown';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const clearance = clearanceForAttempt(options, attempt);
    const seedKey = code + (attempt ? `:retry:${attempt}` : '');
    const seed = 1 + createHash('sha256').update(seedKey).digest().readUInt32BE(0) % 2147483646;

    await client.query('BEGIN');
    try {
      // Clear partial/invalid leftovers from this seeder so the barangay can complete.
      await client.query(DELETE_SEEDED_SQL, [SOURCE, code]);

      const result = await client.query(INSERT_SQL, [b.id, options.count, seed, SOURCE, clearance, attempt]);

      const verified = await client.query(VERIFY_SQL, [b.id, options.count, code, SOURCE]);
      const got = verified.rows[0].count;
      if (got < options.min) {
        lastReason = `only ${got} valid parcels (need ${options.min}) at ${clearance} m clearance`;
        throw Object.assign(new Error(lastReason), { retryable: true });
      }

      const overlaps = await client.query(OVERLAP_SQL, [SOURCE, code, clearance]);
      if (overlaps.rows[0].overlaps) {
        lastReason = `overlap or road clearance violation at ${clearance} m clearance`;
        throw Object.assign(new Error(lastReason), { retryable: true });
      }

      await client.query('COMMIT');
      return { ok: true, inserted: result.rowCount, count: got, clearance };
    } catch (error) {
      await client.query('ROLLBACK');
      if (!error.retryable) throw error;   // real database error: stop the run
      if (attempt < MAX_ATTEMPTS - 1) {
        console.log(`Retrying ${code} (${attempt + 2}/${MAX_ATTEMPTS}): ${lastReason}`);
      }
    }
  }
  return { ok: false, reason: lastReason };
}

async function run(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  loadEnvConfig(path.resolve(__dirname, '../..'));
  const client = new Client({
    host: process.env.PGSQL_HOST,
    port: Number(process.env.PGSQL_PORT || 5432),
    user: process.env.PGSQL_USER,
    password: process.env.PGSQL_PASSWORD,
    database: options.database,
  });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(739214, 2)');
    const { rows: barangays } = await client.query(`SELECT id, bgy_code, bgy_name, mun_name,
      geom IS NOT NULL AND NOT public.ST_IsEmpty(geom) AND public.ST_IsValid(geom)
      AND public.ST_SRID(geom) = 4326 AS usable
      FROM core.brgy_bndry WHERE ${NCR} ORDER BY bgy_code, id`);
    if (!barangays.length) throw new Error('No NCR barangays found in core.brgy_bndry. Import boundary data first.');
    const codes = new Set();
    for (const b of barangays) {
      const code = b.bgy_code?.trim();
      if (!b.usable || !code || codes.has(code)) throw new Error(`Invalid boundary or missing/duplicate barangay code: ${b.bgy_code} (${b.bgy_name})`);
      codes.add(code);
    }
    console.log(`Target: ${options.database}. NCR barangays: ${barangays.length}. Parcels per barangay: ${options.min}-${options.count}. Expected seed rows: ${barangays.length * options.min}-${barangays.length * options.count}.`);
    if (options.preview) { console.log('Preview only; no parcels inserted.'); return; }
    const legacy = await client.query(`SELECT count(*)::integer AS legacy_count FROM data.parcel
      WHERE source IN ('synthetic-ncr-parcels-v1','synthetic-ncr-parcels-v2') AND parcel_id LIKE 'SYN-NCR-%'`);
    if (legacy.rows[0]?.legacy_count > 0) throw new Error('Old large synthetic parcels still exist. Remove the v1/v2 synthetic samples using HOW_TO_RUN.txt before regenerating. No parcels were inserted.');
    console.log(`Building-sized rectangles: 8-14 m wide, 8-18 m long. Road clearance: ${options.roadClearance} m preferred, down to ${options.minRoadClearance} m if needed.`);

    let inserted = 0;
    let skipped = 0;
    const failed = [];
    for (const [index, b] of barangays.entries()) {
      const code = b.bgy_code.trim();

      // Fast path: already has at least the minimum number of valid parcels -> skip.
      const done = await client.query(VERIFY_SQL, [b.id, options.count, code, SOURCE]);
      if (done.rows[0].count >= options.min) {
        skipped++;
      } else {
        const outcome = await seedBarangay(client, b, options);
        if (outcome.ok) {
          inserted += outcome.inserted;
        } else {
          failed.push({ code, name: b.bgy_name, mun: b.mun_name, reason: outcome.reason });
          console.log(`SKIPPED ${code} (${b.bgy_name}, ${b.mun_name}): ${outcome.reason}`);
        }
      }
      if ((index + 1) % 25 === 0 || index === barangays.length - 1) {
        console.log(`Processed ${index + 1}/${barangays.length} barangays; inserted ${inserted}, skipped (already complete) ${skipped}, failed ${failed.length}.`);
      }
    }
    console.log(`Complete. Inserted ${inserted} synthetic parcels; ${skipped} barangays already complete; ${failed.length} barangays could not reach ${options.min} parcels.`);
    if (failed.length) {
      console.log('Barangays without enough room (little free land after road clearance):');
      for (const f of failed) console.log(`  ${f.code}  ${f.name}, ${f.mun}  - ${f.reason}`);
      process.exitCode = 2;
    }
  } finally { await client.end(); }
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs, clearanceForAttempt, INSERT_SQL, VERIFY_SQL, DELETE_SEEDED_SQL, OVERLAP_SQL, run };