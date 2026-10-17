// app/api/pages/poi/table/route.ts
import { NextResponse } from "next/server";
import { loadPoiTable } from "@/lib/pages/poi/poi_table";

// GET /api/pages/poi/table?page=&pageSize=&sort=&dir=&search=&filters=&lat=&lng=&km=&scope=
//   -> { total, capped, browsable, rows }
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  try {
    return NextResponse.json(await loadPoiTable(sp));
  } catch (err) {
    console.error("POI table error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}