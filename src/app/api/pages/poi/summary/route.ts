import { NextRequest, NextResponse } from "next/server";
import { loadPoiSummary, isGroupField } from "@/lib/pages/poi/poi_summary_controller";

export async function GET(req: NextRequest) {
  // TODO: same session check you use in the table / tiles routes
  const sp = req.nextUrl.searchParams;

  const groupBy = sp.get("groupBy") ?? "";
  if (!isGroupField(groupBy)) {
    return NextResponse.json({ error: "bad groupBy" }, { status: 400 });
  }

  const limit = Math.min(Math.max(Math.trunc(Number(sp.get("limit"))) || 10, 1), 50);

  try {
    return NextResponse.json(await loadPoiSummary(sp, groupBy, limit));
  } catch (e) {
    console.error("poi summary failed", e);
    return NextResponse.json({ error: "summary failed" }, { status: 500 });
  }
}