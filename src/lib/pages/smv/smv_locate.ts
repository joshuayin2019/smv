// FILE: src/lib/pages/smv/smv_locate.ts  (server only; new file, next to smv_table_sql.ts)
// Where does one road sit in the table result? Uses the SAME query parser as /table, so the
// search, filters, radius, sort and tie-breaker are identical by construction.
import { conn } from "@/lib/db";
import {
  DEFAULT_PAGE_SIZE,
  MAX_BROWSABLE,
  MAX_PAGE_SIZE,
  parseTableQuery,
} from "@/lib/pages/smv/smv_table_sql";

type Locate = { found: boolean; reachable: boolean; page: number | null };
const NOT_FOUND: Locate = { found: false, reachable: false, page: null };

export async function locateSMV(sp: URLSearchParams) {
  try {
    const idRaw = (sp.get("id") ?? "").trim();
    if (!/^\d{1,15}$/.test(idRaw)) return { success: true, data: NOT_FOUND };

    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE))
    );

    const q = parseTableQuery(sp);
    if (q.denied) return { success: true, data: NOT_FOUND };

    const params = [...q.params, Number(idRaw)];
    const idP = `$${params.length}`;
    const s = q.sortCol; // whitelisted SQL expression the table sorts by
    const cmp = q.desc ? ">" : "<";

    // 1. the target row, only if it passes the same filters as the table
    // 2. count the rows that come before it in the table order:
    //    ORDER BY <sortCol> <dir> NULLS LAST, x.id ASC
    const sql = `
      WITH target AS (
        SELECT x.id AS tid, ${s} AS sv
        FROM data.smv x
        ${q.whereSql} AND x.id = ${idP}
      )
      SELECT
        (SELECT count(*) FROM target)::int AS found,
        (
          SELECT count(*)
          FROM data.smv x CROSS JOIN target t
          ${q.whereSql}
            AND (
              (t.sv IS NOT NULL AND (
                (${s} IS NOT NULL AND ${s} ${cmp} t.sv)
                OR (${s} = t.sv AND x.id < t.tid)
              ))
              OR (t.sv IS NULL AND (${s} IS NOT NULL OR x.id < t.tid))
            )
        )::int AS before
    `;

    const { rows } = await conn.query(sql, params);
    if (!rows[0] || Number(rows[0].found) === 0) return { success: true, data: NOT_FOUND };

    const position = Number(rows[0].before) + 1; // 1-based row number in the result
    return {
      success: true,
      data: {
        found: true,
        reachable: position <= MAX_BROWSABLE,
        page: Math.floor((position - 1) / pageSize) + 1,
      } satisfies Locate,
    };
  } catch (error) {
    console.warn("smv_locate.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}
