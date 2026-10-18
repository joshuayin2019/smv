import { NextRequest, NextResponse } from "next/server";
import { loadSmvSummary, isGroupField, isMeasure } from "@/lib/pages/smv/smv_summary";

export async function GET(req: NextRequest) {
  // TODO: same session check you use in the table route
  const sp = req.nextUrl.searchParams;

  const groupBy = sp.get("groupBy") ?? "";
  const measure = sp.get("measure") ?? "count";
  if (!isGroupField(groupBy)) return NextResponse.json({ error: "bad groupBy" }, { status: 400 });
  if (!isMeasure(measure)) return NextResponse.json({ error: "bad measure" }, { status: 400 });

  const limit = Math.min(Math.max(Math.trunc(Number(sp.get("limit"))) || 10, 1), 50);

  try {
    return NextResponse.json(await loadSmvSummary(sp, groupBy, measure, limit));
  } catch (e) {
    console.error("smv summary failed", e);
    return NextResponse.json({ error: "summary failed" }, { status: 500 });
  }
}