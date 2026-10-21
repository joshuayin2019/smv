// FILE: src/lib/pages/boundary/city/municipality_table_sql.ts
import { conn } from "@/lib/db";

// Text filters in the column headers (the browser sends the same keys)
export const FILTER_KEYS = [
  "reg_code",
  "reg_name",
  "pro_code",
  "pro_name",
  "mun_code",
  "mun_name",
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

// Columns the table may sort by (whitelist: the value is put into the SQL text)
const SORT_KEYS = ["id", ...FILTER_KEYS] as const;
type SortKey = (typeof SORT_KEYS)[number];

// Columns the global search looks at
const SEARCH_COLS = ["id::text", ...FILTER_KEYS];

const DEFAULT_SORT: SortKey = "mun_name";
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 10;

export type MunicipalityQuery = {
  search: string;
  filters: Partial<Record<FilterKey, string>>;
  sort: SortKey;
  dir: "asc" | "desc";
};

// Reads and cleans the query string. Anything unknown is ignored.
export function parseMunicipalityQuery(sp: URLSearchParams): {
  query: MunicipalityQuery;
  page: number;
  pageSize: number;
} {
  const filters: MunicipalityQuery["filters"] = {};
  try {
    const raw = JSON.parse(sp.get("filters") ?? "{}");
    for (const k of FILTER_KEYS) {
      const v = raw?.[k];
      if (typeof v === "string" && v.trim() !== "") filters[k] = v.trim();
    }
  } catch {
    // bad JSON -> no column filters
  }

  const sortParam = sp.get("sort") ?? "";
  const sort = (SORT_KEYS as readonly string[]).includes(sortParam)
    ? (sortParam as SortKey)
    : DEFAULT_SORT;

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(sp.get("pageSize"))) || DEFAULT_PAGE_SIZE)
  );
  const page = Math.max(1, Math.floor(Number(sp.get("page"))) || 1);

  return {
    query: {
      search: (sp.get("search") ?? "").trim(),
      filters,
      sort,
      dir: sp.get("dir") === "desc" ? "desc" : "asc",
    },
    page,
    pageSize,
  };
}

// "contains, any case" pattern; % _ \ typed by the user are matched literally
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

function buildWhere(q: MunicipalityQuery) {
  const params: unknown[] = [];
  const conds: string[] = [];

  if (q.search) {
    params.push(likePattern(q.search));
    const p = `$${params.length}`;
    conds.push(`(${SEARCH_COLS.map((c) => `${c} ILIKE ${p}`).join(" OR ")})`);
  }

  for (const k of FILTER_KEYS) {
    const v = q.filters[k];
    if (!v) continue;
    params.push(likePattern(v));
    conds.push(`${k} ILIKE $${params.length}`);
  }

  return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

// The sort column is whitelisted above; id is the tie-breaker so paging is stable
const orderBy = (q: MunicipalityQuery) =>
  `${q.sort} ${q.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id ASC`;

// One page of the table + how many rows match
export async function loadMunicipalityTable(
  q: MunicipalityQuery,
  page: number,
  pageSize: number
) {
  try {
    const { where, params } = buildWhere(q);

    const count = await conn.query(
      `SELECT COUNT(*)::int AS total FROM core.muni_bndry ${where}`,
      params
    );

    const { rows } = await conn.query(
      `SELECT id::int AS id, reg_code, reg_name, pro_code, pro_name, mun_code, mun_name
       FROM core.muni_bndry
       ${where}
       ORDER BY ${orderBy(q)}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return {
      success: true,
      status: 200,
      data: { total: count.rows[0]?.total ?? 0, rows },
    };
  } catch (err) {
    console.error("loadMunicipalityTable failed:", err);
    return { success: false, status: 500, message: "Failed to load municipalities" };
  }
}

// On which page does one municipality sit in the current result (same search / filters / sort)?
export async function locateMunicipality(q: MunicipalityQuery, pageSize: number, id: number) {
  try {
    const { where, params } = buildWhere(q);

    const { rows } = await conn.query(
      `SELECT t.rn::int AS rn
       FROM (
         SELECT id, row_number() OVER (ORDER BY ${orderBy(q)}) AS rn
         FROM core.muni_bndry
         ${where}
       ) t
       WHERE t.id = $${params.length + 1}`,
      [...params, id]
    );

    const rn: number | undefined = rows[0]?.rn;
    return {
      success: true,
      status: 200,
      data: {
        found: rn !== undefined,
        page: rn !== undefined ? Math.ceil(rn / pageSize) : null,
      },
    };
  } catch (err) {
    console.error("locateMunicipality failed:", err);
    return { success: false, status: 500, message: "Failed to locate municipality" };
  }
}