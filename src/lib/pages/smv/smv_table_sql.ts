// src/lib/pages/smv/smv_table_sql.ts  (server only; used by the table and locate routes)
import { buildScope, parseScope } from "@/lib/pages/smv/smv_scope";



export const COUNT_CAP = 100_000;
export const MAX_BROWSABLE = 10_000;


export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
// Only the first MAX_BROWSABLE rows of a result can be paged to (deep OFFSETs get slow)

// The total is counted only up to this many rows; beyond it the table shows "100,000+"

const MAX_TEXT_LENGTH = 100;

export const FROM_SQL = `FROM data.smv x`;

// Header text filters (key sent by the client -> column). Matched with ILIKE '%text%'.
// smv_year is matched exactly, see below.
const TEXT_FILTER_COLUMNS: Record<string, string> = {
  pro_name: "x.pro_name",
  mun_name: "x.mun_name",
  bgy_name: "x.bgy_name",
  fclass: "x.fclass",
};

// Numeric filters on the zonal values
const ZONAL_KEYS = ["r", "c", "i", "a"] as const;
const NUM_OPS: Record<string, string> = {
  eq: "=",
  ne: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

// Whitelist of sortable columns. Never put a client value into ORDER BY directly.
// Zonal values of 0 count as "no value" (same as the old client-side table) and sort last.
const SORT_COLUMNS: Record<string, string> = {
  id: "x.id",
  street: "x.street",
  bgy_name: "x.bgy_name",
  mun_name: "x.mun_name",
  pro_name: "x.pro_name",
  fclass: "x.fclass",
  smv_year: "x.smv_year",
  r: "NULLIF(x.r, 0)",
  c: "NULLIF(x.c, 0)",
  i: "NULLIF(x.i, 0)",
  a: "NULLIF(x.a, 0)",
};

// The record returned for each row (same fields the map and details use, including bbox)
export const ROW_SELECT = `
  x.id, x.objectid, x.fid_ncr_ro, x.osm_id, x.code, x.fclass,
  x.reg_code, x.pro_code, x.mun_code, x.bgy_code,
  x.reg_name, x.pro_name, x.mun_name, x.bgy_name,
  x.district, x.zone, x.street, x.smv_year,
  x.r, x.c, x.i, x.a, x.flg, x.dist,
  json_build_array(
    ST_XMin(x.geom), ST_YMin(x.geom),
    ST_XMax(x.geom), ST_YMax(x.geom)
  ) AS bbox
`;

function num(sp: URLSearchParams, name: string): number | null {
  const raw = sp.get(name);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// a JSON value (number, numeric string or "") -> number or null
function numOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// user text -> safe ILIKE pattern ("%text%" with % _ \ escaped)
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

export type TableQuery = {
  denied: boolean; // the user's scope allows nothing -> return no rows
  params: unknown[];
  whereSql: string;
  distanceExpr: string;
  orderBy: string;
  sortCol: string; // whitelisted SQL expression the rows are sorted by (used to locate a row)
  desc: boolean;
};

export function parseTableQuery(sp: URLSearchParams): TableQuery {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = ["x.geom IS NOT NULL"];

  // user scope
  const items = parseScope(sp.get("scope"));
  const scope = items ? buildScope(items, 0) : null;
  if (!scope) {
    return {
      denied: true,
      params,
      whereSql: "",
      distanceExpr: "NULL::float8",
      orderBy: "x.id",
      sortCol: "x.id",
      desc: false,
    };
  }
  params.push(...scope.params); // buildScope numbered them $1..$n
  if (scope.cond) where.push(scope.cond);

  // header text filters: {"mun_name":"quezon","fclass":"primary","smv_year":"2024"}
  const filters = parseJsonObject(sp.get("filters"));
  for (const [key, col] of Object.entries(TEXT_FILTER_COLUMNS)) {
    const value = filters[key];
    const text = typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : "";
    if (text) where.push(`${col} ILIKE ${add(likePattern(text))}`);
  }
  const yearRaw = filters.smv_year;
  const year = typeof yearRaw === "string" || typeof yearRaw === "number" ? String(yearRaw).trim() : "";
  if (year) where.push(`x.smv_year::text = ${add(year.slice(0, MAX_TEXT_LENGTH))}`);

  // numeric zonal filters:
  // {"r":{"mode":"cond","op":"gt","value":5000},"c":{"mode":"range","min":1000,"max":9000}}
  // Roads without a value (null or 0) never match, like before.
  const numFilters = parseJsonObject(sp.get("num"));
  for (const key of ZONAL_KEYS) {
    const f = numFilters[key];
    if (!f || typeof f !== "object") continue;
    const { mode, op, value, min, max } = f as Record<string, unknown>;
    const col = `x.${key}`;
    const conds: string[] = [];

    if (mode === "range") {
      const lo = numOrNull(min);
      const hi = numOrNull(max);
      if (lo !== null) conds.push(`${col} >= ${add(lo)}::float8`);
      if (hi !== null) conds.push(`${col} <= ${add(hi)}::float8`);
    } else {
      const v = numOrNull(value);
      const sqlOp = typeof op === "string" && Object.hasOwn(NUM_OPS, op) ? NUM_OPS[op] : null;
      if (v !== null && sqlOp) conds.push(`${col} ${sqlOp} ${add(v)}::float8`);
    }
    if (conds.length) where.push(`${col} > 0`, ...conds);
  }

  // global search: street (contains) or an exact ID. Needs a pg_trgm index on x.street.
  const search = (sp.get("search") ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  if (search) {
    const parts = [`x.street ILIKE ${add(likePattern(search))}`];
    if (/^\d{1,15}$/.test(search)) parts.push(`x.id = ${add(Number(search))}`);
    where.push(`(${parts.join(" OR ")})`);
  }

  // radius in METERS around a point: roads that touch the circle (real line geometry).
  // 1. bounding box on geom (GiST index)  2. exact distance with geography
  const lat = num(sp, "lat");
  const lng = num(sp, "lng");
  const mRaw = num(sp, "m");
  let distanceExpr = "NULL::float8";
  if (lat !== null && lng !== null && mRaw !== null && mRaw > 0) {
    const meters = Math.min(Math.max(mRaw, 1), 200_000); // clamp: 1 m .. 200 km
    // box in degrees, wide enough in longitude too
    const delta = meters / 1000 / (111.32 * Math.cos((lat * Math.PI) / 180));

    const lngP = add(lng);
    const latP = add(lat);
    const center = `ST_SetSRID(ST_MakePoint(${lngP}::float8, ${latP}::float8), 4326)`;

    where.push(`x.geom && ST_Expand(${center}, ${add(delta)}::float8)`);
    where.push(`ST_DWithin(x.geom::geography, ${center}::geography, ${add(meters)}::float8)`);
    distanceExpr = `ST_Distance(x.geom::geography, ${center}::geography)`;
  }

  // sorting (x.id as the tie-breaker keeps pages stable)
  const sortKey = sp.get("sort") ?? "street";
  const dir = sp.get("dir") === "desc" ? "DESC" : "ASC";
  const sortCol =
    sortKey === "distance_m"
      ? distanceExpr
      : Object.hasOwn(SORT_COLUMNS, sortKey)
        ? SORT_COLUMNS[sortKey]
        : SORT_COLUMNS.street;
  const orderBy = `${sortCol} ${dir} NULLS LAST, x.id ASC`;

  return {
    denied: false,
    params,
    whereSql: `WHERE ${where.join(" AND ")}`,
    distanceExpr,
    orderBy,
    sortCol,
    desc: dir === "DESC",
  };
}