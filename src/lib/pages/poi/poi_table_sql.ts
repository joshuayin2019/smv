// lib/poi_table_sql.ts  (server only; used by poi_table.ts)
import { buildScope, parseScope } from "@/lib/pages/poi/poi_scope";

// ---- limits that keep the table fast on 50M+ rows ---------------------------------------------
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
// Only the first MAX_BROWSABLE rows of a result can be paged to (deep OFFSETs get slower and slower).
// Users narrow the result with search / filters / radius instead.
export const MAX_BROWSABLE = 10_000;
// The total is counted only up to this many rows; beyond it the table shows "100,000+".
export const COUNT_CAP = 100_000;
// Longest search / filter text accepted (protects the database from huge patterns)
const MAX_TEXT_LENGTH = 100;
// Fuzzy (typo tolerant) search only starts from this many characters
const FUZZY_MIN_LENGTH = 3;

// Same tables and aliases as the tile queries (x = data.poi, z = lookup.category)
export const FROM_SQL = `
  FROM data.poi x
  INNER JOIN lookup.category z ON x.category_id = z.category_id
`;

// Columns that have a text filter in the table header (key sent by the client -> column).
// The client sends {"category":"coffee","region":"ncr"}; each text is matched with ILIKE '%text%'.
export const FILTER_COLUMNS: Record<string, string> = {
  category: "z.name",
  region: "x.reg_name",
  province: "x.pro_name",
  city_municipality: "x.mun_name",
  barangay: "x.bgy_name",
};

// Whitelist of sortable columns. Never put a client value into ORDER BY directly.
const SORT_COLUMNS: Record<string, string> = {
  id: "x.id",
  name: "x.name",
  category: "z.name",
  barangay: "x.bgy_name",
  city_municipality: "x.mun_name",
  province: "x.pro_name",
  region: "x.reg_name",
  district: "''",
  rd_name: "x.rd_name",
  ft_traffic: "x.ft_traffic",
  as_of: "x.as_of",
};

// The record returned for each row: same fields as the details window + position.
// lng/lat are only computed for the rows of the page (ORDER BY ... LIMIT happens first).
export const ROW_SELECT = `
  x.fid,
  x.id,
  x.name,
  z.name AS category,
  x.category_id,
  x.ft_traffic,
  x.rd_name,
  x.as_of,
  x.bgy_name AS barangay,
  ''::text AS district,
  x.mun_name AS city_municipality,
  x.pro_name AS province,
  x.reg_name AS region,
  x.filename,
  x.reg_code,
  x.pro_code,
  x.mun_code,
  x.bgy_code,
  ST_X(ST_Transform(x.geom_3857, 4326)) AS lng,
  ST_Y(ST_Transform(x.geom_3857, 4326)) AS lat
`;

function num(sp: URLSearchParams, name: string): number | null {
  const raw = sp.get(name);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// user text -> safe ILIKE pattern ("%text%" with % _ \ escaped)
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

export type TableQuery = {
  denied: boolean; // the user's scope allows nothing -> return no rows
  params: unknown[];
  whereSql: string;
  distanceExpr: string;
  orderBy: string;
  sortCol: string; // the whitelisted SQL expression the rows are sorted by (used to locate a row)
  desc: boolean; // sort direction
};

export function parseTableQuery(sp: URLSearchParams): TableQuery {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = ["x.geom_3857 IS NOT NULL"]; // rows without a position never show on the map either

  // user scope (same rules as the tiles)
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

  // column filters (text typed in the column header): {"region":"ncr","category":"coffee"}
  let filters: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(sp.get("filters") ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      filters = parsed as Record<string, unknown>;
    }
  } catch {
    filters = {};
  }
  for (const [key, col] of Object.entries(FILTER_COLUMNS)) {
    const value = filters[key];
    const text = typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : "";
    if (text) where.push(`${col} ILIKE ${add(likePattern(text))}`);
  }

  // global search on the name (contains match + typo tolerant match) or an exact ID.
  // Searching many columns would scan the whole table, so it is limited to these two.
  // Both name conditions use the same pg_trgm GIN index on x.name (see the index notes).
  const search = (sp.get("search") ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  if (search) {
    const like = add(likePattern(search));
    const parts = [`x.name ILIKE ${like}`];
    if (search.length >= FUZZY_MIN_LENGTH) {
      // word_similarity: "starbuks" still finds "Starbucks Coffee". Needs: CREATE EXTENSION pg_trgm;
      parts.push(`${add(search)}::text <% x.name`);
    }
    if (/^\d{1,15}$/.test(search)) parts.push(`x.id = ${add(Number(search))}`);
    where.push(`(${parts.join(" OR ")})`);
  }

  // radius around a center point. Two steps:
  //  1. ST_DWithin on geom_3857 (uses the GiST index). Web Mercator stretches distances by 1/cos(lat),
  //     so the search distance is enlarged by that factor (+2%) to be sure nothing inside the circle is lost.
  //  2. exact distance in real metres (geography) on the few rows that passed step 1.
  const lat = num(sp, "lat");
  const lng = num(sp, "lng");
  const km = num(sp, "km");
  let distanceExpr = "NULL::float8";
  if (lat !== null && lng !== null && km !== null && km > 0) {
    const lngP = add(lng);
    const latP = add(lat);
    const kmP = add(km);
    const center = `ST_SetSRID(ST_MakePoint(${lngP}::float8, ${latP}::float8), 4326)`;

    where.push(`ST_DWithin(
      x.geom_3857,
      ST_Transform(${center}, 3857),
      (${kmP}::float8 * 1000 / cos(radians(${latP}::float8))) * 1.02
    )`);

    distanceExpr = `ST_Distance(ST_Transform(x.geom_3857, 4326)::geography, ${center}::geography) / 1000`;
    where.push(`${distanceExpr} <= ${kmP}::float8`);
  }

  // sorting (x.id as the tie-breaker keeps pages stable)
  const sortKey = sp.get("sort") ?? "name";
  const dir = sp.get("dir") === "desc" ? "DESC" : "ASC";
  const sortCol =
    sortKey === "distance_km"
      ? distanceExpr
      : Object.prototype.hasOwnProperty.call(SORT_COLUMNS, sortKey)
        ? SORT_COLUMNS[sortKey]
        : SORT_COLUMNS.name;
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
