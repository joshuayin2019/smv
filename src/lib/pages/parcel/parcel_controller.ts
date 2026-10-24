import { conn } from '@/lib/db';
import { buildScopeFilter } from '@/lib/pages/demographic/population/population_controller';
import type { Scope } from '@/stores/global_stores';
import type { ParcelResult, ParcelRow } from './parcel_types';

const CAP = 100000;
const PAGE_SIZE = 20;
const MAX_PAGE = 10000;
const SORT_COLUMNS: Record<string,string> = Object.fromEntries(
  ['id','parcel_id','parcel_name','classification','reg_name','pro_name','mun_name','bgy_name','source','as_of'].map(k => [k,`b.${k}`]));
const summaries = new Map<string, { at: number; row: { total: number; classifications: { name: string; value: string }[]; bounds: number[] | null } }>();
const ROWS = `b.id::text AS id, b.parcel_id, b.parcel_name, b.classification,
  b.reg_name, b.pro_name, b.mun_name, b.bgy_name, b.address, b.source,
  b.as_of, b.remarks, b.created_at, b.updated_at`;

export function parcelFilter(scopes: Scope[], sp: URLSearchParams) {
  const scope = buildScopeFilter(scopes, 1);
  if (!scope) return null;
  const params: unknown[] = [...scope.params];
  let sql = `TRUE${scope.sql}`;
  const search = (sp.get('search') || '').trim().slice(0, 100);
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    sql += ` AND (b.parcel_id ILIKE ${p} OR b.parcel_name ILIKE ${p} OR b.bgy_name ILIKE ${p} OR b.mun_name ILIKE ${p})`;
  }
  const classification = (sp.get('classification') || '').trim().slice(0, 100);
  if (classification) {
    params.push(classification.toLowerCase());
    sql += ` AND lower(btrim(b.classification)) = $${params.length}`;
  }
  return { sql, params };
}

export async function loadParcels(scopes: Scope[], sp: URLSearchParams): Promise<ParcelResult> {
  const rawPage = Number(sp.get('page') || 1);
  const sizeInput = Number(sp.get('pageSize') || PAGE_SIZE);
  const pageSize = Number.isFinite(sizeInput) ? Math.min(100,Math.max(1,Math.floor(sizeInput))) : PAGE_SIZE;
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.min(MAX_PAGE, Math.floor(rawPage))) : 1;
  const empty: ParcelResult = { rows: [], total: 0, capped: false, page: 1, pageSize, classifications: [], bounds: null };
  const filter = parcelFilter(scopes, sp);
  if (!filter) return empty;
  const summaryKey = JSON.stringify([filter.sql, filter.params]);
  const cached = summaries.get(summaryKey);
  let row = cached && Date.now() - cached.at < 60000 && sp.get('refresh') !== '1' ? cached.row : null;
  if (!row) {
  const summary = await conn.query(`SELECT
    (SELECT count(*)::integer FROM (SELECT 1 FROM data.parcel b WHERE ${filter.sql} LIMIT ${CAP + 1}) limited) AS total,
    COALESCE((SELECT json_agg(c) FROM (
      SELECT COALESCE(NULLIF(lower(btrim(b.classification)), ''), 'Unspecified') AS name, count(*) AS value
      FROM data.parcel b WHERE ${filter.sql} GROUP BY 1 ORDER BY 1
    ) c), '[]'::json) AS classifications,
    (SELECT ARRAY[public.ST_XMin(e),public.ST_YMin(e),public.ST_XMax(e),public.ST_YMax(e)] FROM (
      SELECT public.ST_Extent(b.geom) AS e FROM data.parcel b WHERE ${filter.sql}
    ) ext) AS bounds`, filter.params);
  row = summary.rows[0];
  if (summaries.size >= 100) summaries.delete(summaries.keys().next().value!);
  summaries.set(summaryKey, { at: Date.now(), row: row! });
  }
  if (!row) return empty;
  const actualPage = Math.min(page, Math.max(1,Math.ceil(Math.min(Number(row.total),10000) / pageSize)));
  const offset = (actualPage - 1) * pageSize;
  const limit = Math.min(pageSize,10000-offset);
  const sort = SORT_COLUMNS[sp.get('sort') || 'parcel_name'] || 'b.parcel_name';
  const direction = sp.get('direction') === 'desc' ? 'DESC' : 'ASC';
  const result = await conn.query<ParcelRow>(`SELECT ${ROWS} FROM data.parcel b
    WHERE ${filter.sql} ORDER BY ${sort} ${direction} NULLS LAST, b.id ASC LIMIT ${limit} OFFSET $${filter.params.length + 1}`,
    [...filter.params, offset]);
  return { rows: result.rows, total: Math.min(Number(row.total), CAP), capped: Number(row.total) > CAP,
    page: actualPage, pageSize,
    classifications: row.classifications.map((c: { name: string; value: string }) => ({ name: c.name, value: Number(c.value) })),
    bounds: row.bounds?.length === 4 && row.bounds.every((v: unknown) => v !== null)
      ? row.bounds.map(Number) as [number,number,number,number] : null };
}

export async function parcelSummary(scopes: Scope[], sp: URLSearchParams) {
  const filter = parcelFilter(scopes,sp);
  if (!filter) return { items: [],other: 0,total: 0 };
  const groups: Record<string,string> = { classification: 'b.classification',region: 'b.reg_name',province: 'b.pro_name',city_municipality: 'b.mun_name',barangay: 'b.bgy_name' };
  const group = groups[sp.get('groupBy') || 'classification'] || groups.classification;
  const limitInput = Number(sp.get('limit') || 10);
  const limit = Number.isFinite(limitInput) ? Math.min(30,Math.max(1,Math.floor(limitInput))) : 10;
  const { rows } = await conn.query(`SELECT COALESCE(NULLIF(btrim(${group}),''),'Unspecified') AS name,
    count(*) AS value FROM data.parcel b WHERE ${filter.sql} GROUP BY 1 ORDER BY value DESC,name`,filter.params);
  const items = rows.slice(0,limit).map(r => ({ name: r.name,value: Number(r.value) }));
  const total = rows.reduce((s,r) => s+Number(r.value),0);
  return { items,other: total-items.reduce((s,r) => s+r.value,0),total };
}

export async function loadParcel(scopes: Scope[], id: string) {
  if (!/^\d{1,19}$/.test(id)) return null;
  const filter = parcelFilter(scopes, new URLSearchParams());
  if (!filter) return null;
  const { rows } = await conn.query(`SELECT ${ROWS},
    ARRAY[public.ST_XMin(b.geom),public.ST_YMin(b.geom),public.ST_XMax(b.geom),public.ST_YMax(b.geom)] AS bounds
    FROM data.parcel b WHERE ${filter.sql} AND b.id = $${filter.params.length + 1}::bigint`, [...filter.params, id]);
  return rows[0] || null;
}

export async function locateParcel(scopes: Scope[], sp: URLSearchParams, id: string) {
  const missing = { found: false,reachable: false,page: null as number | null };
  const filter = parcelFilter(scopes,sp);
  if (!filter || !/^\d{1,19}$/.test(id)) return missing;
  const rawSize = Number(sp.get('pageSize') || PAGE_SIZE);
  const size = Number.isFinite(rawSize) ? Math.min(100,Math.max(1,Math.floor(rawSize))) : PAGE_SIZE;
  const sort = SORT_COLUMNS[sp.get('sort') || 'parcel_name'] || 'b.parcel_name';
  const direction = sp.get('direction') === 'desc' ? 'DESC' : 'ASC';
  const idParam = `$${filter.params.length+1}::bigint`;
  const { rows } = await conn.query(`WITH ranked AS (
    SELECT b.id, row_number() OVER (ORDER BY ${sort} ${direction} NULLS LAST,b.id ASC) AS position
    FROM data.parcel b WHERE ${filter.sql}
    ORDER BY ${sort} ${direction} NULLS LAST,b.id ASC LIMIT 10000
  ) SELECT (SELECT position FROM ranked WHERE id = ${idParam}) AS position
    FROM data.parcel b WHERE ${filter.sql} AND b.id = ${idParam}`,[...filter.params,id]);
  if (!rows.length) return missing;
  const position = Number(rows[0].position);
  return { found: true,reachable: position > 0,page: position > 0 ? Math.ceil(position/size) : null };
}

export async function parcelTile(scopes: Scope[], sp: URLSearchParams, z: number, x: number, y: number) {
  const filter = parcelFilter(scopes, sp);
  if (!filter || z < 12) return Buffer.alloc(0);
  const n = filter.params.length;
  const { rows } = await conn.query(`WITH env AS (
    SELECT public.ST_TileEnvelope($${n+1}::integer,$${n+2}::integer,$${n+3}::integer) AS g,
      public.ST_TileEnvelope($${n+1}::integer,$${n+2}::integer,$${n+3}::integer, margin => 0.015625) AS margin
  ), features AS (
    SELECT b.id::text AS id, b.parcel_id, b.parcel_name,
      COALESCE(lower(btrim(b.classification)), 'unspecified') AS classification,
      public.ST_AsMVTGeom(b.geom_3857, env.g, 4096, 64, true) AS geom
    FROM data.parcel b CROSS JOIN env
    WHERE ${filter.sql} AND b.geom_3857 && env.margin
  ) SELECT public.ST_AsMVT(features, 'parcel',4096,'geom') AS tile FROM features WHERE geom IS NOT NULL`,
    [...filter.params, z, x, y]);
  return rows[0]?.tile || Buffer.alloc(0);
}
