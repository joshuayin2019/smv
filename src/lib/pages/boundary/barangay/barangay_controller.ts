// FILE: src/lib/pages/boundary/city/city_controller.ts
import { conn } from "@/lib/db";

// Extent of one municipality as [minLng, minLat, maxLng, maxLat] in EPSG:4326 (or null if no geometry)
export async function loadBarangayExtent(id: number) {
  try {
    const { rows } = await conn.query(
      `SELECT CASE
                WHEN s.b IS NULL THEN NULL
                ELSE ARRAY[ST_XMin(s.b), ST_YMin(s.b), ST_XMax(s.b), ST_YMax(s.b)]::float8[]
              END AS bbox
       FROM (
         SELECT Box2D(ST_Transform(geom, 4326)) AS b
         FROM core.brgy_bndry
         WHERE id = $1
       ) s`,
      [id]
    );

    return { success: true, status: 200, data: rows[0]?.bbox ?? null };
  } catch (err) {
    console.error("loadBarangayExtent failed:", err);
    return { success: false, status: 500, message: "Failed to load municipality extent" };
  }
}