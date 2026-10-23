import { conn } from "@/lib/db";
import type { Scope } from "@/stores/global_stores";
import { buildScopeFilter, isLevel, type Level } from "./population_controller";

export type GroupBy = "name" | "reg_name" | "pro_name" | "mun_name";
export type Measure = "sum" | "count" | "avg";

export type PopFilter = {
  mode?: "cond" | "range";
  op?: string;
  value?: unknown;
  min?: unknown;
  max?: unknown;
};

export type SummaryParams = {
  level: string;
  groupBy?: string;
  measure?: string;
  limit?: number;
  search?: string;
  filters?: Record<string, string>;
  pop?: PopFilter | null;
};

export type SummaryResult = {
  items: { name: string; value: number }[];
  other: number; // sum / count of everything beyond the limit (0 for averages)
  total: number; // total population of the areas matching the filters
  areas: number; // number of areas matching the filters
};

const EMPTY_RESULT: SummaryResult = { items: [], other: 0, total: 0, areas: 0 };

// Group fields that exist in each level (same rule as the summary panel)
const GROUPS_BY_LEVEL: Record<Level, GroupBy[]> = {
  region: ["name"],
  province: ["name", "reg_name"],
  municipality: ["name", "reg_name", "pro_name"],
  barangay: ["name", "reg_name", "pro_name", "mun_name"],
};

const NUM_OPS: Record<string, string> = {
  eq: "=",
  ne: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

const TEXT_FILTER_KEYS = ["reg_name", "pro_name", "mun_name"] as const;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const like = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

// One row per area of the level, only inside the scope. The columns that do not apply
// to a level are NULL (same shape as the table). "b" is the alias buildScopeFilter expects.
// Region / province / municipality are sums of the municipalities, like the map tiles.
const areasSql = (level: Level, scopeSql: string) => {
  switch (level) {
    case "region":
      return `
        SELECT b.reg_code AS code, MAX(b.reg_name) AS name,
               NULL::text AS mun_name, NULL::text AS pro_name, NULL::text AS reg_name,
               SUM(b.population)::bigint AS population
        FROM data.psa_2020_municipalities b
        WHERE TRUE${scopeSql}
        GROUP BY b.reg_code`;
    case "province":
      return `
        SELECT b.pro_code AS code, MAX(b.pro_name) AS name,
               NULL::text AS mun_name, NULL::text AS pro_name, MAX(b.reg_name) AS reg_name,
               SUM(b.population)::bigint AS population
        FROM data.psa_2020_municipalities b
        WHERE TRUE${scopeSql}
        GROUP BY b.pro_code`;
    case "municipality":
      return `
        SELECT b.mun_code AS code, MAX(b.mun_name) AS name,
               NULL::text AS mun_name, MAX(b.pro_name) AS pro_name, MAX(b.reg_name) AS reg_name,
               SUM(b.population)::bigint AS population
        FROM data.psa_2020_municipalities b
        WHERE TRUE${scopeSql}
        GROUP BY b.mun_code`;
    case "barangay":
      return `
        SELECT b.bgy_code AS code, b.bgy_name AS name,
               b.mun_name AS mun_name, b.pro_name AS pro_name, b.reg_name AS reg_name,
               COALESCE(p.population, 0)::bigint AS population
        FROM core.brgy_bndry b
        JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
        WHERE TRUE${scopeSql}`;
  }
};

export async function loadPopulationSummary(params: SummaryParams, scope: Scope[]) {
  try {
    if (!isLevel(params.level)) return { success: false, message: "Bad level", status: 400 };
    const level: Level = params.level;

    // groupBy is checked against a whitelist, so it is safe to put in the SQL text
    const groupParam = (params.groupBy ?? "name") as GroupBy;
    const groupBy: GroupBy = GROUPS_BY_LEVEL[level].includes(groupParam) ? groupParam : "name";

    const measure: Measure =
      params.measure === "count" || params.measure === "avg" ? params.measure : "sum";

    const limit = Math.min(Math.max(Math.trunc(Number(params.limit)) || 10, 1), 100);

    const filter = buildScopeFilter(scope, 1);
    if (!filter) return { success: true, status: 200, data: EMPTY_RESULT }; // no access, nothing to count

    // scope params are $1..$n, the rest are added after them
    const sqlParams: unknown[] = [...filter.params];
    const add = (v: unknown) => {
      sqlParams.push(v);
      return `$${sqlParams.length}`;
    };

    // ----- The same search / filters the table applies --------------------------
    const where: string[] = [];

    const search = (params.search ?? "").trim();
    if (search) {
      const p = add(like(search));
      where.push(`(name ILIKE ${p} OR code ILIKE ${p})`);
    }

    for (const key of TEXT_FILTER_KEYS) {
      const text = String(params.filters?.[key] ?? "").trim();
      if (text) where.push(`${key} ILIKE ${add(like(text))}`);
    }

    const pop = params.pop;
    if (pop?.mode === "cond") {
      const op = NUM_OPS[pop.op ?? ""];
      if (op && isNum(pop.value)) where.push(`population ${op} ${add(pop.value)}`);
    } else if (pop?.mode === "range") {
      if (isNum(pop.min)) where.push(`population >= ${add(pop.min)}`);
      if (isNum(pop.max)) where.push(`population <= ${add(pop.max)}`);
    }

    const cte = `
      WITH areas AS (${areasSql(level, filter.sql)}),
      filtered AS MATERIALIZED (
        SELECT * FROM areas
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      )`;

    // Grouping by "name" groups on the area code (barangay names repeat); the label is the name
    const keyCol = groupBy === "name" ? "code" : groupBy;
    const labelCol = groupBy === "name" ? "name" : groupBy;
    const agg =
      measure === "sum" ? "SUM(population)" : measure === "count" ? "COUNT(*)" : "ROUND(AVG(population))";

    const itemsSql = `
      SELECT COALESCE(NULLIF(TRIM(label), ''), 'Unknown') AS name, value
      FROM (
        SELECT MAX(${labelCol}) AS label, ${agg} AS value
        FROM filtered
        GROUP BY ${keyCol}
      ) t
      ORDER BY value DESC NULLS LAST, name
      LIMIT ${limit}`;

    // Reuse the filtered rows for both totals and chart items, including empty results.
    const { rows } = await conn.query(
      `${cte}, items AS (${itemsSql})
       SELECT COALESCE(SUM(population), 0) AS total, COUNT(*) AS areas,
              COALESCE((SELECT json_agg(i ORDER BY i.value DESC NULLS LAST, i.name) FROM items i), '[]'::json) AS items
       FROM filtered`,
      sqlParams
    );

    const items = (rows[0]?.items ?? []).map((r: { name: string; value: string | number }) => ({
      name: r.name,
      value: Number(r.value),
    }));
    const total = Number(rows[0]?.total ?? 0);
    const areas = Number(rows[0]?.areas ?? 0);

    // Everything beyond the limit, for the "Other ..." slice (averages cannot be added up)
    const shown = items.reduce((s: number, i: { value: number }) => s + i.value, 0);
    const other =
      measure === "sum"
        ? Math.max(total - shown, 0)
        : measure === "count"
          ? Math.max(areas - shown, 0)
          : 0;

    return { success: true, status: 200, data: { items, other, total, areas } as SummaryResult };
  } catch (error) {
    console.warn("population_summary_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}
