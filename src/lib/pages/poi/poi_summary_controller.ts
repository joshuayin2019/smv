// src/lib/pages/poi/poi_summary.ts  (server only)
import { conn } from "@/lib/db";
// adjust this path to wherever poi_table_sql.ts lives in your project
import { parseTableQuery, FROM_SQL, FILTER_COLUMNS } from "@/lib/pages/poi/poi_table_sql";

// What the chart can group by = the columns that already have a filter in the table
export const GROUP_FIELDS = Object.keys(FILTER_COLUMNS);
export type GroupField = string;

export const isGroupField = (v: string): v is GroupField =>
  Object.prototype.hasOwnProperty.call(FILTER_COLUMNS, v);

export type PoiSummary = {
  items: { name: string; value: number }[]; // top groups, largest first
  other: number; // sum of every group beyond the limit
  total: number; // POIs matching the table's current query
};

const EMPTY: PoiSummary = { items: [], other: 0, total: 0 };

// ----- small in-memory cache (same idea as the tile cache) --------------------
const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; data: PoiSummary }>();
const inFlight = new Map<string, Promise<PoiSummary>>();

function cacheGet(key: string): PoiSummary | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

function cacheSet(key: string, data: PoiSummary) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Counts POIs per group for the same query the table uses.
 * `sp` is the table's querystring (scope, filters, search, lat/lng/km); sort and paging are ignored.
 */
export async function loadPoiSummary(
  sp: URLSearchParams,
  groupBy: GroupField,
  limit: number
): Promise<PoiSummary> {
  const q = parseTableQuery(sp);
  if (q.denied) return EMPTY; // the user's scope allows nothing

  const key = JSON.stringify([groupBy, limit, q.whereSql, q.params]);
  const hit = cacheGet(key);
  if (hit) return hit;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = (async (): Promise<PoiSummary> => {
    const col = FILTER_COLUMNS[groupBy]; // whitelisted SQL expression, never a client string
    const params = [...q.params, limit];

    const sql = `
      WITH grouped AS (
        SELECT COALESCE(NULLIF(btrim(${col}), ''), 'Unspecified') AS name,
               count(*)::int AS value
        ${FROM_SQL}
        ${q.whereSql}
        GROUP BY 1
      )
      SELECT name, value, (SUM(value) OVER ())::int AS total  -- total of ALL groups, computed before LIMIT
      FROM grouped
      ORDER BY value DESC, name
      LIMIT $${params.length}
    `;

    const { rows } = await conn.query(sql, params);
    const total: number = rows[0]?.total ?? 0;
    const items = rows.map((r: { name: string; value: number }) => ({
      name: r.name,
      value: r.value,
    }));
    const data: PoiSummary = {
      items,
      other: total - items.reduce((s, r) => s + r.value, 0),
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