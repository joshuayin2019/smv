// app/api/pages/poi/details/[id]/route.ts
import { NextResponse } from "next/server";
import { conn } from "@/lib/db"; // <- change to your existing pg pool / client

// Same fields as the old SELECT_POI, but without geom (position comes from the clicked tile feature).
const SELECT_POI_DETAILS = `
  SELECT json_build_object(
    'fid', x.fid,
    'id', x.id,
    'name', x.name,
    'category', z.name,
    'category_id', x.category_id,
    'ft_traffic', x.ft_traffic,
    'rd_name', x.rd_name,
    'as_of', x.as_of,
    'barangay', x.bgy_name,
    'district', '',
    'city_municipality', x.mun_name,
    'province', x.pro_name,
    'region', x.reg_name,
    'filename', x.filename,
    'reg_code', x.reg_code,
    'pro_code', x.pro_code,
    'mun_code', x.mun_code,
    'bgy_code', x.bgy_code
  ) AS properties
  FROM data.poi x
  INNER JOIN lookup.category z ON x.category_id = z.category_id
  WHERE x.id = $1
  -- TODO: add the same scope filter the tile route uses, so users cannot fetch ids outside their scope
  LIMIT 1
`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ids are numeric in your window (spherePoiIdRef compares numbers); reject anything else early
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { rows } = await conn.query(SELECT_POI_DETAILS, [numericId]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0].properties);
  } catch (err) {
    console.error("POI details error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}