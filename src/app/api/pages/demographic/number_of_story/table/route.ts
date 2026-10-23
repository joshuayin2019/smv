import { NextRequest, NextResponse } from "next/server";
import {
  loadBuildingStoryTable,
  parseTableQuery,
} from "@/lib/pages/demographic/number_of_story/number_of_story_table_controller";

export async function GET(req: NextRequest) {
  const parsed = parseTableQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const res = await loadBuildingStoryTable(parsed.query);
  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }

  return NextResponse.json(res.data, {
    headers: { "Cache-Control": "private, no-store" }, // depends on the user's scope
  });
}