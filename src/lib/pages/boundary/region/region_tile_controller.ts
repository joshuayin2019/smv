// FILE: src/lib/pages/region/region_tile_controller.ts  (new file, server only)
import { conn } from "@/lib/db";

// Region polygons are big and detailed, so simplify them hard when zoomed out.
// Tolerance in screen pixels. 0 = no simplification.
function simplifyPxFor(z: number): number {
  if (z <= 4) return 3;
  if (z <= 6) return 2;
  if (z <= 8) return 1;
  if (z <= 10) return 0.5;
  return 0;
}

// Needs a GiST index:  CREATE INDEX ON core.region_bndry USING gist (geom);
// (assumes geom is SRID 4326, like data.smv)
const tileSql = (z: number) => {
  const px = simplifyPxFor(z); // a number from the function above, safe to put in the SQL

  const geomExpr =
    px > 0
      ? `ST_SimplifyPreserveTopology(ST_Transform(x.geom, 3857), b.mpp * ${px})`
      : `ST_Transform(x.geom, 3857)`;

  return `
    WITH env AS (
      SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS geom
    ),
    bounds AS (
      SELECT geom, (ST_XMax(geom) - ST_XMin(geom)) / 512.0 AS mpp FROM env
    ),
    mvt AS (
      SELECT
        x.id, x.reg_code, x.reg_name,
        ST_AsMVTGeom(${geomExpr}, b.geom, 4096, 64, true) AS geom
      FROM core.region_bndry x, bounds b
      WHERE x.geom && ST_Transform(b.geom, 4326)
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

    const { rows } = await conn.query(tileSql(z), [z, x, y]);
    const tile: Buffer | null = rows[0]?.tile ?? null;

    return { success: true as const, data: tile && tile.length > 0 ? tile : null };
  } catch (error) {
    console.warn("region_tile_controller.ts:", error);
    return { success: false as const, message: "Internal server error", status: 500 };
  }
}
