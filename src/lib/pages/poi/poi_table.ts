// lib/poi_table.ts  (server only; same pattern as loadPoiTile in poi_tiles.ts)
import { conn } from "@/lib/db";
import { withSlot } from "@/lib/pages/poi/poi_scope";
import {
  COUNT_CAP,
  DEFAULT_PAGE_SIZE,
  FROM_SQL,
  MAX_BROWSABLE,
  MAX_PAGE_SIZE,
  ROW_SELECT,
  parseTableQuery,
  type TableQuery,
} from "@/lib/pages/poi/poi_table_sql";

const COUNT_TTL_MS = 10 * 60 * 1000;
const COUNT_CACHE_MAX = 500;

export type PoiTablePage = {
  total: number; // matching rows, counted up to COUNT_CAP
  capped: boolean; // true = there are more than `total` matches (show "100,000+")
  browsable: number; // how many of them the pagination can reach (deep OFFSETs are not allowed)
  rows: Record<string, unknown>[];
};

// ---------------------------------------------------------------------------
// Count: capped, cached per query (paging and sorting do not change it) and shared between
// identical requests that arrive at the same time.
// ---------------------------------------------------------------------------

type CountResult = { total: number; capped: boolean };
const countCache = new Map<string, { at: number; value: CountResult }>();
const countInFlight = new Map<string, Promise<CountResult>>();

function countKey(sp: URLSearchParams): string {
  const copy = new URLSearchParams(sp);
  for (const k of ["page", "pageSize", "sort", "dir"]) copy.delete(k);
  copy.sort();
  return copy.toString();
}

async function countRows(sp: URLSearchParams, q: TableQuery): Promise<CountResult> {
  const key = countKey(sp);

  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at <= COUNT_TTL_MS) return hit.value;
  countCache.delete(key);

  const pending = countInFlight.get(key);
  if (pending) return pending;

  const job = withSlot(() =>
    // the LIMIT stops the scan early: at most COUNT_CAP + 1 rows are ever read
    conn.query(
      `SELECT count(*)::int AS n
       FROM (SELECT 1 ${FROM_SQL} ${q.whereSql} LIMIT ${COUNT_CAP + 1}) t`,
      q.params
    )
  )
    .then((res): CountResult => {
      const n = Number(res.rows[0]?.n ?? 0);
      const value = { total: Math.min(n, COUNT_CAP), capped: n > COUNT_CAP };
      countCache.set(key, { at: Date.now(), value });
      if (countCache.size > COUNT_CACHE_MAX) {
        const oldest = countCache.keys().next().value;
        if (oldest !== undefined) countCache.delete(oldest);
      }
      return value;
    })
    .finally(() => {
      countInFlight.delete(key);
    });

  countInFlight.set(key, job);
  return job;
}

function readPageSize(sp: URLSearchParams): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(sp.get("pageSize"))) || DEFAULT_PAGE_SIZE));
}

/**
 * One page of the table: filtered, searched, radius-limited and sorted by the database.
 * `sp` = the request's query string (page, pageSize, sort, dir, search, filters, lat, lng, km, scope).
 */
export async function loadPoiTable(sp: URLSearchParams): Promise<PoiTablePage> {
  const q = parseTableQuery(sp);
  if (q.denied) return { total: 0, capped: false, browsable: 0, rows: [] }; // scope allows nothing

  const pageSize = readPageSize(sp);
  const lastPage = Math.max(1, Math.ceil(MAX_BROWSABLE / pageSize));
  const page = Math.min(lastPage, Math.max(1, Math.floor(Number(sp.get("page"))) || 1));
  const offset = (page - 1) * pageSize;

  const limitParam = `$${q.params.length + 1}`;
  const offsetParam = `$${q.params.length + 2}`;
  const rowsSql = `
    SELECT ${ROW_SELECT}, ${q.distanceExpr} AS distance_km
    ${FROM_SQL}
    ${q.whereSql}
    ORDER BY ${q.orderBy}
    LIMIT ${limitParam}::int OFFSET ${offsetParam}::int
  `;

  const [count, data] = await Promise.all([
    countRows(sp, q),
    withSlot(() => conn.query(rowsSql, [...q.params, pageSize, offset])),
  ]);

  // The rows of this page prove that at least offset + rows.length matches exist, even when the
  // cached count is older than the data. The total therefore never contradicts the rows shown.
  const total = Math.max(count.total, offset + data.rows.length);

  return {
    total,
    capped: count.capped,
    browsable: Math.min(total, MAX_BROWSABLE),
    rows: data.rows,
  };
}

// ---------------------------------------------------------------------------
// Locate: on which page of the CURRENT result (same search / filters / radius / sort / page size)
// does one POI sit? Used when a POI is clicked on the map, so the table can jump to its page.
// ---------------------------------------------------------------------------

export type PoiLocation = {
  found: boolean; // the POI is part of the current result
  reachable: boolean; // its page is within MAX_BROWSABLE (deeper pages cannot be opened)
  position: number | null; // rows before it in the sorted result (0 = first row)
  page: number | null; // 1-based page, null when not found or not reachable
};

const NOT_FOUND: PoiLocation = { found: false, reachable: false, position: null, page: null };

/**
 * Counts the rows that come before the POI in the table's ORDER BY (sort column, direction,
 * NULLS LAST, then id ASC) and turns that into a page number. The count stops at MAX_BROWSABLE + 1
 * rows, so a POI far down a huge result is reported as "not reachable" instead of scanning everything.
 */
export async function locatePoi(sp: URLSearchParams, id: number): Promise<PoiLocation> {
  const q = parseTableQuery(sp);
  if (q.denied) return NOT_FOUND;

  const pageSize = readPageSize(sp);
  const idParam = `$${q.params.length + 1}`;
  const sc = q.sortCol;
  const op = q.desc ? ">" : "<";

  // `target` = the POI's sort value, only if it passes the current filters.
  // A row is "before" the target when it sorts earlier; NULL sort values come last.
  const sql = `
    WITH target AS (
      SELECT x.id AS tid, ${sc} AS tv
      ${FROM_SQL}
      ${q.whereSql} AND x.id = ${idParam}::bigint
    )
    SELECT
      EXISTS (SELECT 1 FROM target) AS found,
      (
        SELECT count(*)::int FROM (
          SELECT 1
          ${FROM_SQL}, target t
          ${q.whereSql}
          AND (
            (t.tv IS NULL AND (${sc} IS NOT NULL OR x.id < t.tid))
            OR (t.tv IS NOT NULL AND (${sc} ${op} t.tv OR (${sc} = t.tv AND x.id < t.tid)))
          )
          LIMIT ${MAX_BROWSABLE + 1}
        ) c
      ) AS before
  `;

  const res = await withSlot(() => conn.query(sql, [...q.params, id]));
  const row = res.rows[0];
  if (!row?.found) return NOT_FOUND;

  const position = Number(row.before ?? 0);
  if (position >= MAX_BROWSABLE) return { found: true, reachable: false, position, page: null };
  return { found: true, reachable: true, position, page: Math.floor(position / pageSize) + 1 };
}
