// FILE: src/app/api/pages/boundary/city/route.ts
import { NextResponse } from "next/server";
import { loadMunicipalityExtent } from "@/lib/pages/boundary/city/city_controller";

export async function POST(request: Request) {
  const req = await request.json();

  switch (req.mode) {
    // extent of one municipality: [minLng, minLat, maxLng, maxLat] in EPSG:4326, or null
    case "municipalityextent": {
      const id = Number(req.data?.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ message: "Bad Request" }, { status: 400 });
      }
      const result = await loadMunicipalityExtent(id);
      return NextResponse.json(
        { message: result.success ? result.data : result.message },
        { status: result.status }
      );
    }

    default:
      return NextResponse.json({ message: "Bad Request" }, { status: 404 });
  }
}