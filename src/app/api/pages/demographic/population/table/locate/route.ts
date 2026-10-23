import { NextRequest, NextResponse } from "next/server";
import {
  locatePopulation,
  parseTableQuery,
} from "@/lib/pages/demographic/population/population_table_controller";

export async function GET(req: NextRequest) {
  const parsed = parseTableQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const res = await locatePopulation(parsed.query, id);
  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }

  return NextResponse.json(res.data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}