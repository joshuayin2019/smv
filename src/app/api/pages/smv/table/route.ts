import { NextRequest, NextResponse } from "next/server";
import { conn } from "@/lib/db";
import {
  parseTableQuery,
  FROM_SQL,
  ROW_SELECT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_BROWSABLE,
  COUNT_CAP,
} from "@/lib/pages/smv/smv_table_sql";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export async function GET(req: NextRequest) {
  // TODO: same session check you use in the other routes
  const sp = req.nextUrl.searchParams;

  const pageSize = clamp(Math.trunc(Number(sp.get("pageSize"))) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const maxPage = Math.max(1, Math.floor(MAX_BROWSABLE / pageSize));
  const page = clamp(Math.trunc(Number(sp.get("page"))) || 1, 1, maxPage);
  const offset = (page - 1) * pageSize;

  const q = parseTableQuery(sp);
  if (q.denied) return NextResponse.json({ total: 0, capped: false, browsable: 0, rows: [] });

  try {
    const [countRes, rowsRes] = await Promise.all([
      // counts at most COUNT_CAP + 1 rows, so it stays fast on big results
      conn.query(
        `SELECT count(*)::int AS n FROM (SELECT 1 ${FROM_SQL} ${q.whereSql} LIMIT ${COUNT_CAP + 1}) t`,
        q.params
      ),
      conn.query(
        `SELECT ${ROW_SELECT}, ${q.distanceExpr} AS distance_m
         ${FROM_SQL}
         ${q.whereSql}
         ORDER BY ${q.orderBy}
         LIMIT $${q.params.length + 1} OFFSET $${q.params.length + 2}`,
        [...q.params, pageSize, offset]
      ),
    ]);

    const n: number = countRes.rows[0]?.n ?? 0;
    return NextResponse.json({
      total: Math.min(n, COUNT_CAP),
      capped: n > COUNT_CAP,
      browsable: Math.min(n, MAX_BROWSABLE),
      rows: rowsRes.rows,
    });
  } catch (e) {
    console.error("smv table failed", e);
    return NextResponse.json({ error: "table failed" }, { status: 500 });
  }
}