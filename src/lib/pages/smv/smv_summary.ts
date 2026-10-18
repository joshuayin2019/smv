// src/lib/pages/smv/smv_summary.ts  (server only)
import { conn } from "@/lib/db";
import { parseTableQuery, FROM_SQL } from "@/lib/pages/smv/smv_table_sql";

// What the chart can group by (whitelisted SQL expressions, never a client string)
const GROUP_COLUMNS: Record<string, string> = {
  fclass: "x.fclass",
  smv_year: "x.smv_year::text",
  reg_name: "x.reg_name",
  pro_name: "x.pro_name",
  mun_name: "x.mun_name",
  bgy_name: "x.bgy_name",
};
export const GROUP_FIELDS = Object.keys(GROUP_COLUMNS);
export const isGroupField = (v: string) => Object.hasOwn(GROUP_COLUMNS, v);

// What is measured per group. Zonal values of 0 count as "no value", like in the table.
const MEASURES: Record<string, string> = {
  count: "count(*)::float8",
  r: "round(avg(NULLIF(x.r, 0))::numeric)::float8",
  c: "round(avg(NULLIF(x.c, 0))::numeric)::float8",
  i: "round(avg(NULLIF(x.i, 0))::numeric)::float8",
  a: "round(avg(NULLIF(x.a, 0))::numeric)::float8",
};
export const isMeasure = (v: string) => Object.hasOwn(MEASURES, v);

export type SmvSummary = {
  items: { name: string; value: number }[]; // top groups, largest first
  other: number; // sum of the groups beyond the limit (only for the road count, otherwise 0)
  total: number; // roads matching the table's current query
};

const EMPTY: SmvSummary = { items: [], other: 0, total: 0 };

// ----- small in-memory cache (same idea as the POI summary) --------------------
const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; data: SmvSummary }>();
const inFlight = new Map<string, Promise<SmvSummary>>();

function cacheGet(key: string): SmvSummary | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

function cacheSet(key: string, data: SmvSummary) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Aggregates the same query the table uses. `sp` is the table's querystring
 * (scope, filters, numeric filters, search, radius); sort and paging are ignored.
 */
export async function loadSmvSummary(
  sp: URLSearchParams,
  groupBy: string,
  measure: string,
  limit: number
): Promise<SmvSummary> {
  const q = parseTableQuery(sp);
  if (q.denied) return EMPTY; // the user's scope allows nothing

  const key = JSON.stringify([groupBy, measure, limit, q.whereSql, q.params]);
  const hit = cacheGet(key);
  if (hit) return hit;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = (async (): Promise<SmvSummary> => {
    const col = GROUP_COLUMNS[groupBy];
    const params = [...q.params, limit];

    const sql = `
      WITH grouped AS (
        SELECT COALESCE(NULLIF(btrim(${col}), ''), 'Unspecified') AS name,
               count(*)::int AS n,
               ${MEASURES[measure]} AS value
        ${FROM_SQL}
        ${q.whereSql}
        GROUP BY 1
      ),
      ranked AS (
        SELECT name, n, value, (SUM(n) OVER ())::int AS total  -- roads in ALL groups, before LIMIT
        FROM grouped
      )
      SELECT name, value, total
      FROM ranked
      WHERE value IS NOT NULL            -- groups without any zonal value have nothing to average
      ORDER BY value DESC, name
      LIMIT $${params.length}
    `;

    const { rows } = await conn.query(sql, params);
    const total: number = rows[0]?.total ?? 0;
    const items = rows.map((r: { name: string; value: number }) => ({
      name: r.name,
      value: Number(r.value),
    }));
    const data: SmvSummary = {
      items,
      // "Other" only makes sense for counts; an average of the rest is not a sum
      other: measure === "count" ? total - items.reduce((s, r) => s + r.value, 0) : 0,
      total,
    };
    cacheSet(key, data);
    return data;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, job);
  return job;
}