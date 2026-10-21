import { NextResponse } from "next/server";
import { loadProvinceData } from "@/lib/pages/boundary/province/province_controller";

export async function GET() {
  const res = await loadProvinceData();

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }

  return NextResponse.json(res.data ?? [], {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}