import { conn } from '@/lib/db';
import { parseTableQuery as parseSmv, FROM_SQL as SMV_FROM } from '@/lib/pages/smv/smv_table_sql';
import { parseTableQuery as parsePoi, FROM_SQL as POI_FROM } from '@/lib/pages/poi/poi_table_sql';
import { buildScopeFilter } from '@/lib/pages/demographic/population/population_controller';
import { BUILDING_TYPE_CATEGORIES } from '@/lib/pages/demographic/type_of_buildings/type_of_buildings_categories';
import { YEAR_BUILT_CATEGORIES } from '@/lib/pages/demographic/year_built/year_built_categories';
import { BUILDING_STORY_CATEGORIES } from '@/lib/pages/demographic/number_of_story/number_of_story_categories';
import { CLASS_SQL } from '@/lib/pages/demographic/barangay_class/barangay_class_config';
import type { DashboardData, DashboardScopes, DashboardItem } from './dashboard_types';

const VALUES = [
  { key: 'a', name: 'Agricultural', color: '#22a06b' },
  { key: 'r', name: 'Residential', color: '#2458bd' },
  { key: 'c', name: 'Commercial', color: '#f59e0b' },
  { key: 'i', name: 'Industrial', color: '#9a63da' },
];
const number = (value: unknown) => Number(value ?? 0);
const items = (rows: { name: string; value: unknown }[]): DashboardItem[] => rows.map(r => ({ name: r.name, value: number(r.value) }));
async function market(scopes: DashboardScopes['smv']): Promise<NonNullable<DashboardData['market']>> {
  const q = parseSmv(new URLSearchParams({ scope: JSON.stringify(scopes) }));
  if (q.denied) return { roads: 0, averages: [], years: [] };
  const { rows } = await conn.query(`WITH filtered AS MATERIALIZED (
    SELECT x.r, x.c, x.i, x.a, x.smv_year ${SMV_FROM} ${q.whereSql}
  ) SELECT COUNT(*) AS roads,
    ${VALUES.map(v => `AVG(NULLIF(${v.key}, 0))::float8 AS ${v.key}`).join(', ')},
    COALESCE((SELECT json_agg(y ORDER BY y.name DESC) FROM (
      SELECT COALESCE(smv_year::text, 'Unspecified') AS name, COUNT(*) AS value FROM filtered GROUP BY smv_year
    ) y), '[]'::json) AS years FROM filtered`, q.params);
  const row = rows[0] ?? {};
  return { roads: number(row.roads),
    averages: VALUES.filter(v => row[v.key] != null).map(v => ({ name: v.name, value: number(row[v.key]), color: v.color })),
    years: items(row.years ?? []),
  };
}

async function poi(scopes: DashboardScopes['poi']): Promise<NonNullable<DashboardData['poi']>> {
  const q = parsePoi(new URLSearchParams({ scope: JSON.stringify(scopes) }));
  if (q.denied) return { total: 0, categories: [], areas: [] };
  const { rows } = await conn.query(`WITH filtered AS MATERIALIZED (
    SELECT x.category_id::text AS category_id,
           COALESCE(NULLIF(BTRIM(z.name), ''), 'Unspecified') AS category,
           COALESCE(NULLIF(BTRIM(x.mun_name), ''), 'Unspecified') AS area
    ${POI_FROM} ${q.whereSql}
  ) SELECT COUNT(*) AS total,
    COALESCE((SELECT json_agg(c ORDER BY c.value DESC, c.name) FROM (
      SELECT category AS name, MIN(category_id) AS "categoryId", COUNT(*) AS value FROM filtered GROUP BY category ORDER BY value DESC, name LIMIT 6
    ) c), '[]'::json) AS categories,
    COALESCE((SELECT json_agg(a ORDER BY a.value DESC, a.name) FROM (
      SELECT area AS name, COUNT(*) AS value FROM filtered GROUP BY area ORDER BY value DESC, name LIMIT 5
    ) a), '[]'::json) AS areas FROM filtered`, q.params);
  const row = rows[0] ?? {};
  return { total: number(row.total), categories: (row.categories ?? []).map((r: DashboardItem) => ({ name: r.name, value: number(r.value), categoryId: r.categoryId })), areas: items(row.areas ?? []) };
}

async function parcel(scopes: DashboardScopes['parcel']): Promise<NonNullable<DashboardData['parcel']>> {
  const scope = buildScopeFilter(scopes, 1);
  const classifications = VALUES.map(v => ({ name: v.name, value: 0, color: v.color }));
  if (!scope) return { total: 0, synthetic: 0, classifications };
  const { rows } = await conn.query(`SELECT
      COALESCE(NULLIF(lower(btrim(b.classification)), ''), 'unspecified') AS classification,
      COUNT(*) AS value,
      COUNT(*) FILTER (WHERE b.source IN ('synthetic-ncr-parcels-v1', 'synthetic-ncr-parcels-v2', 'synthetic-ncr-parcels-v3')) AS synthetic
    FROM data.parcel b WHERE TRUE${scope.sql}
    GROUP BY 1 ORDER BY 1`, scope.params);
  let total = 0, synthetic = 0;
  for (const row of rows) {
    const value = number(row.value);
    total += value;
    synthetic += number(row.synthetic);
    const known = classifications.find(c => c.name.toLowerCase() === row.classification);
    if (known) known.value += value;
    else classifications.push({ name: row.classification === 'unspecified' ? 'Unspecified' : row.classification,
      value, color: '#94a3b8' });
  }
  return { total, synthetic, classifications };
}

async function demographic(scopes: DashboardScopes['psa']): Promise<NonNullable<DashboardData['demographic']>> {
  const scope = buildScopeFilter(scopes, 1);
  if (!scope) return { population: 0, male: 0, female: 0, barangays: 0, municipalities: 0, classes: [], buildings: [], years: [], floors: [] };
  const fields = [...BUILDING_TYPE_CATEGORIES, ...YEAR_BUILT_CATEGORIES, ...BUILDING_STORY_CATEGORIES];
  const { rows } = await conn.query(`SELECT SUM(COALESCE(p.population, 0)::bigint) AS population,
      SUM(COALESCE(p.sex_male, 0)::bigint) AS male, SUM(COALESCE(p.sex_female, 0)::bigint) AS female,
      COUNT(*) AS barangays, COUNT(DISTINCT b.mun_code) AS municipalities,
      COUNT(*) FILTER (WHERE ${CLASS_SQL} = 'U') AS urban,
      COUNT(*) FILTER (WHERE ${CLASS_SQL} = 'R') AS rural,
      COUNT(*) FILTER (WHERE ${CLASS_SQL} = 'Unknown') AS unknown,
      ${fields.map(f => `SUM(COALESCE(p.${f.field}, 0)::bigint) AS ${f.field}`).join(', ')}
    FROM core.brgy_bndry b LEFT JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
    WHERE TRUE${scope.sql}`, scope.params);
  const row = rows[0] ?? {};
  const categoryItems = (categories: readonly { field: string; label: string; color: string }[]) =>
    categories.map(c => ({ name: c.label, value: number(row[c.field]), color: c.color }));
  return {
    population: number(row.population), male: number(row.male), female: number(row.female),
    barangays: number(row.barangays), municipalities: number(row.municipalities),
    classes: [{ name: 'Urban', value: number(row.urban), color: '#c000db' }, { name: 'Rural', value: number(row.rural), color: '#00c98b' }, { name: 'Unknown', value: number(row.unknown), color: '#94a3b8' }],
    buildings: categoryItems(BUILDING_TYPE_CATEGORIES), years: categoryItems(YEAR_BUILT_CATEGORIES), floors: categoryItems(BUILDING_STORY_CATEGORIES),
  };
}

const cache = new Map<string, { at: number; data: DashboardData }>();
const pending = new Map<string, Promise<DashboardData>>();
export async function loadDashboard(scopes: DashboardScopes): Promise<DashboardData> {
  const key = JSON.stringify(scopes);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  if (pending.has(key)) return pending.get(key)!;
  const job = (async () => {
    const results = await Promise.allSettled([market(scopes.smv), poi(scopes.poi), demographic(scopes.psa), parcel(scopes.parcel)]);
    const errors: string[] = [];
    const names = ['Market values', 'Points of interest', 'Demographics', 'Parcels'];
    results.forEach((result, i) => { if (result.status === 'rejected') { errors.push(`${names[i]} could not be loaded`); console.warn('Dashboard:', names[i], result.reason); } });
    const data: DashboardData = { generatedAt: new Date().toISOString(),
      market: results[0].status === 'fulfilled' ? results[0].value : null,
      poi: results[1].status === 'fulfilled' ? results[1].value : null,
      demographic: results[2].status === 'fulfilled' ? results[2].value : null,
      parcel: results[3].status === 'fulfilled' ? results[3].value : null, errors,
    };
    if (!errors.length) {
      cache.set(key, { at: Date.now(), data });
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
    }
    return data;
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
