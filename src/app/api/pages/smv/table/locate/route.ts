import { NextRequest, NextResponse } from "next/server";
import { conn } from "@/lib/db";
import {
  parseTableQuery,
  FROM_SQL,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_BROWSABLE,
} from "@/lib/pages/smv/smv_table_sql";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const NOT_FOUND = { found: false, reachable: false, page: null };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const id = Number(sp.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json(NOT_FOUND);

  const pageSize = clamp(Math.trunc(Number(sp.get("pageSize"))) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const maxPage = Math.max(1, Math.floor(MAX_BROWSABLE / pageSize));

  const q = parseTableQuery(sp);
  if (q.denied) return NextResponse.json(NOT_FOUND);

  const idP = `$${q.params.length + 1}`;
  const cmp = q.desc ? ">" : "<";

  // Rows before the target in "sortCol dir NULLS LAST, id ASC" order = its position in the result
  const sql = `
    WITH t AS (
      SELECT ${q.sortCol} AS v, x.id AS id
      ${FROM_SQL}
      ${q.whereSql} AND x.id = ${idP}
      LIMIT 1
    )
    SELECT
      EXISTS (SELECT 1 FROM t) AS found,
      (
        SELECT count(*)::int FROM (
          SELECT 1
          FROM data.smv x, t
          ${q.whereSql}
            AND (
              CASE WHEN t.v IS NULL
                THEN (${q.sortCol} IS NOT NULL OR x.id < t.id)
                ELSE (${q.sortCol} ${cmp} t.v OR (${q.sortCol} = t.v AND x.id < t.id))
              END
            )
          LIMIT ${MAX_BROWSABLE + 1}
        ) b
      ) AS before
  `;

  try {
    const { rows } = await conn.query(sql, [...q.params, id]);
    const found: boolean = rows[0]?.found ?? false;
    if (!found) return NextResponse.json(NOT_FOUND);

    const page = Math.floor((rows[0].before as number) / pageSize) + 1;
    return NextResponse.json({ found: true, reachable: page <= maxPage, page });
  } catch (e) {
    console.error("smv locate failed", e);
    return NextResponse.json(NOT_FOUND);
  }
}