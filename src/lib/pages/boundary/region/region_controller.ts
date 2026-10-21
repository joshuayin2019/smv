import { conn } from "@/lib/db";

export async function loadRegionData() {
  try {
    const { rows } = await conn.query(
      `SELECT id, reg_code, reg_name
       FROM core.region_bndry
       ORDER BY reg_name`
    );

    return { success: true, status: 200, data: rows };
  } catch (err) {
    console.error("loadRegionData failed:", err);
    return { success: false, status: 500, message: "Failed to load regions" };
  }
}

// Extent of one region as [minLng, minLat, maxLng, maxLat] in EPSG:4326 (or null if no geometry)
export async function loadRegionExtent(id: number) {
  try {
    const { rows } = await conn.query(
      `SELECT CASE
                WHEN s.b IS NULL THEN NULL
                ELSE ARRAY[ST_XMin(s.b), ST_YMin(s.b), ST_XMax(s.b), ST_YMax(s.b)]::float8[]
              END AS bbox
       FROM (
         SELECT Box2D(ST_Transform(geom, 4326)) AS b
         FROM core.region_bndry
         WHERE id = $1
       ) s`,
      [id]
    );

    return { success: true, status: 200, data: rows[0]?.bbox ?? null };
  } catch (err) {
    console.error("loadRegionExtent failed:", err);
    return { success: false, status: 500, message: "Failed to load region extent" };
  }
}