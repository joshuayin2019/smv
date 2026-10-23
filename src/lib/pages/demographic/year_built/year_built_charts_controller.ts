import { conn } from '@/lib/db';
import type { Scope } from '@/stores/global_stores';
import { buildScopeFilter, isLevel } from './year_built_controller';
import { YEAR_BUILT_FIELDS, YEAR_BUILT_TOTAL_SQL } from './year_built_sql';
import type { YearBuiltChart } from './year_built_categories';

export async function loadYearBuiltCharts(level: string, bbox: number[], scope: Scope[], code?: string) {
  if (!isLevel(level) || bbox.length !== 4 || !bbox.every(Number.isFinite) ||
      bbox[0] > bbox[2] || bbox[1] > bbox[3]) {
    return { success: false, status: 400, message: 'Bad chart bounds or level' };
  }
  if (code !== undefined && !/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
    return { success: false, status: 400, message: 'Bad area code' };
  }
  const filter = buildScopeFilter(scope, 1);
  if (!filter) return { success: true, status: 200, data: { items: [], truncated: false } };
  const key = { region: 'reg', province: 'pro', municipality: 'mun', barangay: 'bgy' }[level];
  const params = [...filter.params, ...bbox];
  if (code !== undefined) params.push(code);
  const n = filter.params.length;
  const envelope = `ST_MakeEnvelope($${n+1}, $${n+2}, $${n+3}, $${n+4}, 4326)`;
  const codeFilter = code === undefined ? '' : `AND b.${key}_code = $${n+5}`;
  try {
    const { rows } = await conn.query(`
      WITH scoped AS MATERIALIZED (
        SELECT b.${key}_code AS code, b.${key}_name AS name, b.bgy_code,
               b.geom, ${YEAR_BUILT_TOTAL_SQL} AS year_built,
               ${YEAR_BUILT_FIELDS.map(f => `COALESCE(p.${f}, 0)::bigint AS ${f}`).join(', ')}
        FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
        WHERE TRUE${filter.sql} ${codeFilter}
        ${level === 'barangay' && code === undefined ? `AND b.geom && ST_Transform(${envelope}, ST_SRID(b.geom))` : ''}
      ), totals AS (
        SELECT code, MAX(name) AS name, SUM(year_built)::bigint AS year_built,
               ${YEAR_BUILT_FIELDS.map(f => `SUM(${f})::bigint AS ${f}`).join(', ')}
        FROM scoped GROUP BY code
      ), anchors AS (
        ${level === 'barangay' ? `
        SELECT code, ST_Transform(ST_PointOnSurface(ST_Union(geom)), 4326) AS point
        FROM scoped GROUP BY code` : `
        -- Match the same scoped municipality geometry used to draw the map boundaries.
        SELECT b.${key}_code AS code,
               ST_Transform(ST_PointOnSurface(ST_Union(b.geom)), 4326) AS point
        FROM data.psa_2020_municipalities b
        WHERE TRUE${filter.sql} ${codeFilter}
          AND b.${key}_code IN (SELECT code FROM totals)
        GROUP BY b.${key}_code`}
      )
      SELECT t.*, ST_X(a.point) AS lng, ST_Y(a.point) AS lat
      FROM totals t JOIN anchors a USING (code)
      WHERE t.year_built ${code === undefined ? '>' : '>='} 0 AND a.point && ${envelope}
      ORDER BY t.year_built DESC, t.code LIMIT 301`, params);
    const items: YearBuiltChart[] = rows.slice(0, 300).map(r => ({
      code: String(r.code), name: r.name, year_built: Number(r.year_built),
      coordinates: [Number(r.lng), Number(r.lat)],
      values: Object.fromEntries(YEAR_BUILT_FIELDS.map(f => [f, Number(r[f] ?? 0)])),
    }));
    return { success: true, status: 200, data: { items, truncated: rows.length > 300 } };
  } catch (error) {
    console.warn('Year-built charts:', error);
    return { success: false, status: 500, message: 'Could not load year-built charts' };
  }
}
