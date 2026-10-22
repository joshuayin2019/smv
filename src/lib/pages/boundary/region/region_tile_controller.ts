// FILE: src/lib/pages/boundary/region/region_tile_controller.ts  (server only)
import { conn } from "@/lib/db";

// Which stored geometry to use for a zoom level.
// Column names come from this fixed list, never from user input, so they are safe in the SQL.
//  - z 0-6   : geom_z0_6   (heavily simplified)
//  - z 7-12  : geom_z7_12  (moderately simplified)
//  - z 13+   : geom        (full detail; the tile only touches a few regions)
function geomColumnFor(z: number): "geom_z0_6" | "geom_z7_12" | "geom" {
  if (z <= 6) return "geom_z0_6";
  if (z <= 12) return "geom_z7_12";
  return "geom";
}

// Needs the GiST indexes on geom, geom_z0_6 and geom_z7_12 (see the SQL above).
const tileSql = (z: number) => {
  const col = geomColumnFor(z);

  return `
    WITH env AS (
      SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS geom
    ),
    bounds AS (
      SELECT geom, ST_Transform(geom, 4326) AS geom4326 FROM env
    ),
    mvt AS (
      SELECT
        x.id, x.reg_code, x.reg_name,
        ST_AsMVTGeom(ST_Transform(x.${col}, 3857), b.geom, 4096, 64, true) AS geom
      FROM core.region_bndry x, bounds b
      WHERE x.${col} && b.geom4326
    )
    SELECT ST_AsMVT(mvt.*, 'region', 4096, 'geom') AS tile
    FROM mvt
    WHERE geom IS NOT NULL
  `;
};

export async function loadRegionMap(z: number, x: number, y: number) {
  try {
    const max = 2 ** z;
    if (
      ![z, x, y].every(Number.isInteger) ||
      z < 0 || z > 22 ||
      x < 0 || y < 0 || x >= max || y >= max
    ) {
      return { success: false as const, message: "Bad tile coordinates", status: 400 };
    }

    const client = await conn.connect();
    try {
      // Give up on a tile after 10 s instead of holding a pool connection forever
      await client.query("SET statement_timeout = 10000");
      const { rows } = await client.query(tileSql(z), [z, x, y]);
      const tile: Buffer | null = rows[0]?.tile ?? null;
      return { success: true as const, data: tile && tile.length > 0 ? tile : null };
    } finally {
      await client.query("RESET statement_timeout").catch(() => {});
      client.release();
    }
  } catch (error) {
    console.warn("region_tile_controller.ts:", error);
    return { success: false as const, message: "Internal server error", status: 500 };
  }
}