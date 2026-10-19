// FILE: src/app/api/pages/smv/[id]/route.ts  (new file; Next.js App Router)
// Assumes Next.js App Router: app/api/pages/smv/[id]/route.ts
// Static folders (tiles, table) win over [id], so there is no clash.
// Adapt the scope handling to however your tiles route reads it.
// Better: read the scope from the server session instead of the query string.
import { NextRequest, NextResponse } from "next/server";
import { loadSMVById } from "@/lib/pages/smv/tiles/tile_controller"; // adjust to your tile controller path

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let scope: any[] = [];
  try {
    scope = JSON.parse(req.nextUrl.searchParams.get("scope") ?? "[]");
  } catch {
    return NextResponse.json({ message: "Bad scope" }, { status: 400 });
  }

  const res = await loadSMVById(id, scope);
  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  return NextResponse.json({ data: res.data });
}
