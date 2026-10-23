import { NextRequest, NextResponse } from "next/server";
import { loadBuildingTypeMap } from "@/lib/pages/demographic/type_of_buildings/type_of_buildings_controller";
import type { Scope } from "@/stores/global_stores";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;

  let scope: Scope[] = [];
  try {
    const raw = req.nextUrl.searchParams.get("scope");
    scope = raw ? JSON.parse(raw) : [];
  } catch {
    return NextResponse.json({ message: "Bad scope" }, { status: 400 });
  }

  const level = req.nextUrl.searchParams.get("level") ?? "barangay";

  const res = await loadBuildingTypeMap(
    Number(z),
    Number(x),
    Number(y.replace(/\.pbf$/, "")),
    level,
    scope
  );

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }

  if (!res.data) return new NextResponse(null, { status: 204 }); // empty tile

  return new NextResponse(new Uint8Array(res.data as Buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/x-protobuf",
      "Cache-Control": "private, max-age=300", // private: the tile depends on the user's scope
    },
  });
}