// src/app/api/pages/boundary/region/route.ts
import { NextResponse } from "next/server";
import { loadRegionData, loadRegionExtent } from "@/lib/pages/boundary/region/region_controller"; // <- adjust to your loader file

export async function POST(request: Request) {
  const req = await request.json();

  switch (req.mode) {
    // list of regions for the table (same response shape as before: a plain array)
    case "loadregion": {
      const result = await loadRegionData();
      if (!result.success) {
        return NextResponse.json({ message: result.message }, { status: result.status });
      }
      return NextResponse.json(result.data, { status: 200 });
    }

    // extent of one region: [minLng, minLat, maxLng, maxLat] in EPSG:4326, or null
    case "regionextent": {
      const id = Number(req.data?.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ message: "Bad Request" }, { status: 400 });
      }
      const result = await loadRegionExtent(id);
      return NextResponse.json(
        { message: result.success ? result.data : result.message },
        { status: result.status }
      );
    }

    default:
      return NextResponse.json({ message: "Bad Request" }, { status: 404 });
  }
}