import { conn } from "@/lib/db";

export async function loadProvinceData() {
  try {
    const { rows } = await conn.query(
      `SELECT id::int AS id, reg_code, reg_name, pro_code, pro_name
       FROM core.prov_bndry
       ORDER BY reg_code`
    );

    return { success: true, status: 200, data: rows };
  } catch (err) {
    console.error("loadProvinceData failed:", err);
    return { success: false, status: 500, message: "Failed to load provinces" };
  }
}

// Extent of one province as [minLng, minLat, maxLng, maxLat] in EPSG:4326 (or null if no geometry)
export async function loadProvinceExtent(id: number) {
  try {
    const { rows } = await conn.query(
      `SELECT CASE
                WHEN s.b IS NULL THEN NULL
                ELSE ARRAY[ST_XMin(s.b), ST_YMin(s.b), ST_XMax(s.b), ST_YMax(s.b)]::float8[]
              END AS bbox
       FROM (
         SELECT Box2D(ST_Transform(geom, 4326)) AS b
         FROM core.prov_bndry
         WHERE id = $1
       ) s`,
      [id]
    );

    return { success: true, status: 200, data: rows[0]?.bbox ?? null };
  } catch (err) {
    console.error("loadProvinceExtent failed:", err);
    return { success: false, status: 500, message: "Failed to load province extent" };
  }
}