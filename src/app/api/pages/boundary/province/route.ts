import { NextResponse } from "next/server";
import {
  loadProvinceData,
  loadProvinceExtent,
} from "@/lib/pages/boundary/province/province_controller";

export async function GET() {
  const res = await loadProvinceData();

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }

  return NextResponse.json(res.data ?? [], {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export async function POST(request: Request) {
  const req = await request.json();

  switch (req.mode) {
    // extent of one province: [minLng, minLat, maxLng, maxLat] in EPSG:4326, or null
    case "provinceextent": {
      const id = Number(req.data?.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ message: "Bad Request" }, { status: 400 });
      }
      const result = await loadProvinceExtent(id);
      return NextResponse.json(
        { message: result.success ? result.data : result.message },
        { status: result.status }
      );
    }

    default:
      return NextResponse.json({ message: "Bad Request" }, { status: 404 });
  }
}