import { YEAR_BUILT_FIELDS, YEAR_BUILT_TOTAL_SQL } from "./year_built_sql";
// FILE: src/lib/pages/year_built/year_built_table_controller.ts
import { conn } from "@/lib/db";
import type { Scope } from "@/stores/global_stores";
import { isLevel, type Level } from "@/lib/pages/demographic/year_built/year_built_controller";

/* ---------------- Scope (same rules as year_built_controller.ts) ---------------- */

// scope_level: 1 = all, 2 = region, 3 = province, 4 = municipality
// "b" is core.brgy_bndry (barangay) or data.psa_2020_municipalities (region, province, municipality)
const LEVEL_COLUMN: Record<number, string> = {
  2: "b.reg_code",
  3: "b.pro_code",
  4: "b.mun_code",
};

// Returns null when the scope grants no access.
function buildScopeFilter(scopes: Scope[], firstParam: number) {
  if (!Array.isArray(scopes) || scopes.length === 0) return null;

  if (scopes.some((s) => s.scope_level === 1)) {
    return { sql: "", params: [] as string[] };
  }

  const conditions: string[] = [];
  const params: string[] = [];

  for (const s of scopes) {
    const column = LEVEL_COLUMN[s.scope_level];
    if (!column || !s.code) continue;
    params.push(s.code);
    conditions.push(`${column} = $${firstParam + params.length - 1}`);
  }

  if (conditions.length === 0) return null;
  return { sql: ` AND (${conditions.join(" OR ")})`, params };
}

// Region, province and municipality rows are the sum of the municipalities in scope
const GROUP: Record<Exclude<Level, "barangay">, { key: string; name: string }> = {
  region: { key: "b.reg_code", name: "b.reg_name" },
  province: { key: "b.pro_code", name: "b.pro_name" },
  municipality: { key: "b.mun_code", name: "b.mun_name" },
};

/* ---------------- Query (parsed from the querystring) ---------------- */

export const FILTER_KEYS = ["reg_name", "pro_name", "mun_name"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

// Which text filters make sense in each mode (the others are ignored)
const LEVEL_FILTERS: Record<Level, FilterKey[]> = {
  region: [],
  province: ["reg_name"],
  municipality: ["pro_name", "reg_name"],
  barangay: ["mun_name", "pro_name", "reg_name"],
};

const SORT_COLUMNS = ["code", "name", "reg_name", "pro_name", "mun_name", "year_built", ...YEAR_BUILT_FIELDS];

const OPS: Record<string, string> = {
  eq: "=",
  ne: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

export type PopFilter = {
  mode: "cond" | "range";
  op: string;
  value: number | null;
  min: number | null;
  max: number | null;
};

export type TableQuery = {
  level: Level;
  scope: Scope[];
  search: string;
  filters: Partial<Record<FilterKey, string>>;
  year_built: PopFilter | null;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

type Parsed = { ok: true; query: TableQuery } | { ok: false; message: string };

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseTableQuery(sp: URLSearchParams): Parsed {
  const level = sp.get("level") ?? "municipality";
  if (!isLevel(level)) return { ok: false, message: "Bad level" };

  let scope: Scope[] = [];
  const filters: Partial<Record<FilterKey, string>> = {};
  let year_built: PopFilter | null = null;

  try {
    const rawScope = sp.get("scope");
    scope = rawScope ? JSON.parse(rawScope) : [];

    const rawFilters = sp.get("filters");
    const f = rawFilters ? JSON.parse(rawFilters) : {};
    for (const k of FILTER_KEYS) {
      if (typeof f?.[k] === "string" && f[k].trim() !== "") filters[k] = f[k].trim();
    }

    const rawPop = sp.get("pop");
    if (rawPop) {
      const p = JSON.parse(rawPop);
      year_built = {
        mode: p?.mode === "range" ? "range" : "cond",
        op: typeof p?.op === "string" && p.op in OPS ? p.op : "eq",
        value: numOrNull(p?.value),
        min: numOrNull(p?.min),
        max: numOrNull(p?.max),
      };
    }
  } catch {
    return { ok: false, message: "Bad query" };
  }

  const sortRaw = sp.get("sort") ?? "name";
  const sort = SORT_COLUMNS.includes(sortRaw) ? sortRaw : "name";

  return {
    ok: true,
    query: {
      level,
      scope,
      search: (sp.get("search") ?? "").trim(),
      filters,
      year_built,
      sort,
      dir: sp.get("dir") === "desc" ? "desc" : "asc",
      page: Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "10", 10) || 10)),
    },
  };
}

/* ---------------- SQL ---------------- */

// "contains" match, with the LIKE wildcards in the user's text escaped
const like = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

// The part shared by the table and the locate query: the rows of the current mode inside the scope,
// with the search and the filters applied. Returns null when the scope grants no access.
function buildCore(q: TableQuery) {
  const scopeFilter = buildScopeFilter(q.scope, 1);
  if (!scopeFilter) return null;

  const params: unknown[] = [...scopeFilter.params];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const isBgy = q.level === "barangay";
  const g = isBgy ? null : GROUP[q.level as Exclude<Level, "barangay">];
  const codeExpr = isBgy ? "b.bgy_code" : g!.key;
  const nameExpr = isBgy ? "b.bgy_name" : g!.name;

  // Search + column filters run on the source rows (inside the scope), before any grouping.
  // The name / upper names are the same for every row of a group, so this selects whole groups.
  const where: string[] = [];
  if (q.search) {
    const p = add(like(q.search));
    where.push(`(${nameExpr} ILIKE ${p} OR ${codeExpr}::text ILIKE ${p})`);
  }
  for (const k of LEVEL_FILTERS[q.level]) {
    const text = q.filters[k];
    if (text) where.push(`b.${k} ILIKE ${add(like(text))}`);
  }
  const whereSql = where.length ? ` AND ${where.join(" AND ")}` : "";

  const base = isBgy
    ? `SELECT b.bgy_code AS code, b.bgy_name AS name,
              b.mun_name, b.pro_name, b.reg_name,
              ${YEAR_BUILT_TOTAL_SQL} AS year_built,
              ${YEAR_BUILT_FIELDS.map((f) => `COALESCE(p.${f}, 0)::bigint AS ${f}`).join(", ")}
       FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
       WHERE TRUE${scopeFilter.sql}${whereSql}`
    : `SELECT ${g!.key} AS code, MAX(${g!.name}) AS name,
              ${q.level === "municipality" ? "MAX(b.mun_name)" : "NULL::text"} AS mun_name,
              ${q.level === "municipality" || q.level === "province" ? "MAX(b.pro_name)" : "NULL::text"} AS pro_name,
              MAX(b.reg_name) AS reg_name,
              SUM(${YEAR_BUILT_TOTAL_SQL})::bigint AS year_built,
              ${YEAR_BUILT_FIELDS.map((f) => `SUM(COALESCE(p.${f}, 0)::bigint)::bigint AS ${f}`).join(", ")}
       FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
       WHERE TRUE${scopeFilter.sql}${whereSql}
       GROUP BY ${g!.key}`;

  // The year_built filter works on the finished rows (the sum, for the grouped modes)
  const numConds: string[] = [];
  const f = q.year_built;
  if (f) {
    if (f.mode === "cond" && f.value !== null) {
      numConds.push(`year_built ${OPS[f.op]} ${add(f.value)}::numeric`);
    }
    if (f.mode === "range") {
      if (f.min !== null) numConds.push(`year_built >= ${add(f.min)}::numeric`);
      if (f.max !== null) numConds.push(`year_built <= ${add(f.max)}::numeric`);
    }
  }
  const numWhere = numConds.length ? ` WHERE ${numConds.join(" AND ")}` : "";

  return {
    ctes: `base AS (${base}), filt AS (SELECT * FROM base${numWhere})`,
    // sort and dir are whitelisted in parseTableQuery; "code" keeps the order stable
    orderBy: `${q.sort} ${q.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, code ASC`,
    params,
    add,
  };
}

/* ---------------- One page of the table ---------------- */

export async function loadYearBuiltTable(q: TableQuery) {
  try {
    const core = buildCore(q);
    if (!core) return { success: true, status: 200, data: { total: 0, rows: [] as unknown[] } };

    const limit = core.add(q.pageSize);
    const offset = core.add((q.page - 1) * q.pageSize);

    const { rows } = await conn.query(
      `WITH ${core.ctes}
       SELECT
         (SELECT COUNT(*) FROM filt)::int AS total,
         COALESCE(
           (SELECT json_agg(t)
            FROM (SELECT * FROM filt ORDER BY ${core.orderBy} LIMIT ${limit} OFFSET ${offset}) t),
           '[]'::json
         ) AS page_rows`,
      core.params
    );

    const r = rows[0];
    return {
      success: true,
      status: 200,
      data: {
        total: r?.total ?? 0,
        rows: ((r?.page_rows ?? []) as Record<string, unknown>[]).map((x) => ({
          ...x,
          level: q.level,
        })),
      },
    };
  } catch (error) {
    console.warn("year_built_table_controller.ts:", error);
    return { success: false, status: 500, message: "Internal server error" };
  }
}

/* ---------------- Where one area sits in the current result ---------------- */

export async function locateYearBuilt(q: TableQuery, id: string) {
  try {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
      return { success: false, status: 400, message: "Bad id" };
    }

    const core = buildCore(q);
    if (!core) return { success: true, status: 200, data: { found: false, page: null } };

    const idParam = core.add(id);
    const { rows } = await conn.query(
      `WITH ${core.ctes},
       ranked AS (SELECT code, ROW_NUMBER() OVER (ORDER BY ${core.orderBy}) AS rn FROM filt)
       SELECT rn::int AS rn FROM ranked WHERE code::text = ${idParam}`,
      core.params
    );

    const rn: number | undefined = rows[0]?.rn;
    return {
      success: true,
      status: 200,
      data: rn ? { found: true, page: Math.ceil(rn / q.pageSize) } : { found: false, page: null },
    };
  } catch (error) {
    console.warn("year_built_table_controller.ts:", error);
    return { success: false, status: 500, message: "Internal server error" };
  }
}