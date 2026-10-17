// app/api/pages/poi/table/locate/route.ts
import { NextResponse } from "next/server";
import { locatePoi } from "@/lib/pages/poi/poi_table";

// GET /api/pages/poi/table/locate?id=&pageSize=&sort=&dir=&search=&filters=&lat=&lng=&km=&scope=
//   (same query as the table, plus the POI id)  ->  { found, reachable, position, page }
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  const id = sp.get("id") ?? "";
  if (!/^\d{1,15}$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    return NextResponse.json(await locatePoi(sp, Number(id)));
  } catch (err) {
    console.error("POI locate error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
