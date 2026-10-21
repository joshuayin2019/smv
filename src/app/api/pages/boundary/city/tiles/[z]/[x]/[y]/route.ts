// FILE: src/app/api/pages/municipality/tiles/[z]/[x]/[y]/route.ts  (new file; Next.js App Router)
// Add an auth check if the boundaries are not public.
import { NextRequest, NextResponse } from "next/server";
import { loadMunicipalityMap } from "@/lib/pages/boundary/city/municipality_tile_controller";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const p = await ctx.params;
  const res = await loadMunicipalityMap(Number(p.z), Number(p.x), Number(p.y));

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  if (!res.data) return new NextResponse(null, { status: 204 }); // empty tile

  return new NextResponse(new Uint8Array(res.data), {
    headers: {
      "Content-Type": "application/x-protobuf",
      "Cache-Control": "public, max-age=3600", // boundaries rarely change
    },
  });
}
