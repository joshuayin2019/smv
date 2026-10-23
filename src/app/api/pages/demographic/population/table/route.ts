import { NextRequest, NextResponse } from "next/server";
import {
  loadPopulationTable,
  parseTableQuery,
} from "@/lib/pages/demographic/population/population_table_controller";

export async function GET(req: NextRequest) {
  const parsed = parseTableQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const res = await loadPopulationTable(parsed.query);
  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }

  return NextResponse.json(res.data, {
    headers: { "Cache-Control": "private, no-store" }, // depends on the user's scope
  });
}