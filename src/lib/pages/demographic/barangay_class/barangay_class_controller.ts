import { conn } from '@/lib/db';
import { buildScopeFilter, loadPopulationExtent, loadPopulationScopeExtent } from '../population/population_controller';
import { parseTableQuery as parsePopulationQuery } from '../population/population_table_controller';
import { CLASS_SQL } from './barangay_class_config';
import type { Scope } from '@/stores/global_stores';

export const loadBarangayClassScopeExtent = loadPopulationScopeExtent;
export const loadBarangayClassExtent = loadPopulationExtent;

export function parseClassQuery(sp: URLSearchParams) {
  const input = new URLSearchParams(sp);
  input.set('level', 'barangay');
  const parsed = parsePopulationQuery(input);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.query.scope) || parsed.query.scope.some(s => !s || typeof s !== 'object')) {
    return { ok: false as const, message: 'Bad scope' };
  }
  const sort = sp.get('sort') ?? 'name';
  return { ok: true as const, query: {
    ...parsed.query,
    sort: ['name', 'code', 'reg_name', 'pro_name', 'mun_name', 'urban_rural'].includes(sort) ? sort : 'name',
    classification: ['U', 'R', 'Unknown'].includes(sp.get('classification') ?? '') ? sp.get('classification')! : '',
  } };
}
type Query = Extract<ReturnType<typeof parseClassQuery>, { ok: true }>['query'];
const like = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

function core(q: Query) {
  const scope = buildScopeFilter(q.scope, 1);
  if (!scope) return null;
  const params: unknown[] = [...scope.params];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = [];
  if (q.search) {
    const p = add(like(q.search));
    where.push(`(b.bgy_name ILIKE ${p} OR b.bgy_code::text ILIKE ${p})`);
  }
  for (const key of ['reg_name', 'pro_name', 'mun_name'] as const) {
    if (q.filters[key]) where.push(`b.${key} ILIKE ${add(like(q.filters[key]!))}`);
  }
  if (q.classification) where.push(`${CLASS_SQL} = ${add(q.classification)}`);
  return { params, add, order: `${q.sort} ${q.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, code ASC`,
    cte: `WITH areas AS MATERIALIZED (
      SELECT b.bgy_code AS code, b.bgy_name AS name, b.reg_name, b.pro_name, b.mun_name,
             ${CLASS_SQL} AS urban_rural
      FROM core.brgy_bndry b LEFT JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
      WHERE TRUE${scope.sql}${where.length ? ' AND ' + where.join(' AND ') : ''})` };
}

export async function loadClassTable(q: Query) {
  const c = core(q);
  if (!c) return { total: 0, rows: [] };
  const limit = c.add(q.pageSize), offset = c.add((q.page - 1) * q.pageSize);
  const { rows } = await conn.query(`${c.cte}
    SELECT (SELECT COUNT(*)::int FROM areas) AS total,
      COALESCE((SELECT json_agg(r) FROM (SELECT * FROM areas ORDER BY ${c.order} LIMIT ${limit} OFFSET ${offset}) r), '[]'::json) AS rows`, c.params);
  return rows[0] ?? { total: 0, rows: [] };
}

export async function loadClassSummary(q: Query) {
  const c = core(q);
  if (!c) return [];
  const { rows } = await conn.query(`${c.cte} SELECT urban_rural AS classification, COUNT(*)::int AS count FROM areas GROUP BY urban_rural`, c.params);
  return rows;
}

export async function locateClass(q: Query, code: string) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) throw new Error('Bad code');
  const c = core(q);
  if (!c) return { found: false, page: null };
  const id = c.add(code);
  const { rows } = await conn.query(`${c.cte}, ranked AS (SELECT code, ROW_NUMBER() OVER (ORDER BY ${c.order}) AS rn FROM areas)
    SELECT rn FROM ranked WHERE code::text = ${id}`, c.params);
  return { found: !!rows[0], page: rows[0] ? Math.ceil(Number(rows[0].rn) / q.pageSize) : null };
}

export async function loadBarangayClassMap(z: number, x: number, y: number, level: string, scopes: Scope[]) {
  const max = 2 ** z;
  if (level !== 'barangay' || ![z,x,y].every(Number.isInteger) || z < 0 || z > 22 || x < 0 || y < 0 || x >= max || y >= max) {
    return { success: false, status: 400, message: 'Bad tile coordinates or level' };
  }
  const scope = buildScopeFilter(scopes, 4);
  if (!scope) return { success: true, status: 200, data: null };
  try {
    const { rows } = await conn.query(`WITH env AS (SELECT ST_TileEnvelope($1::int,$2::int,$3::int) AS geom),
      mvt AS (
        SELECT b.bgy_code AS code, b.bgy_name AS name, b.reg_name, b.pro_name, b.mun_name,
               ${CLASS_SQL} AS urban_rural,
               ST_AsMVTGeom(ST_Transform(b.geom,3857), env.geom,4096,64,true) AS geom
        FROM core.brgy_bndry b LEFT JOIN data.psa_2020 p ON p.bar_code = b.bgy_code CROSS JOIN env
        WHERE b.geom && ST_Transform(env.geom, ST_SRID(b.geom))${scope.sql}
      ) SELECT ST_AsMVT(mvt.*, 'barangay_class',4096,'geom') AS tile FROM mvt WHERE geom IS NOT NULL`, [z,x,y,...scope.params]);
    return { success: true, status: 200, data: rows[0]?.tile ?? null };
  } catch (error) {
    console.warn('Barangay class tiles:', error);
    return { success: false, status: 500, message: 'Could not load class tiles' };
  }
}
