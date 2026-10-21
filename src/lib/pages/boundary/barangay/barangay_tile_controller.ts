// FILE: src/lib/pages/barangay/barangay_tile_controller.ts  (new file, server only)
import { conn } from "@/lib/db";

// Tolerance in screen pixels. 0 = no simplification.
// (the layer is only shown from zoom 10, see barangay_layer.tsx: far too many polygons per tile below that)
function simplifyPxFor(z: number): number {
  if (z <= 11) return 1;
  if (z <= 13) return 0.5;
  return 0;
}

// Needs a GiST index:  CREATE INDEX ON core.brgy_bndry USING gist (geom);
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
        x.id, x.reg_code, x.reg_name, x.pro_code, x.pro_name, x.mun_code, x.mun_name, x.bgy_code, x.bgy_name,
        ST_AsMVTGeom(${geomExpr}, b.geom, 4096, 64, true) AS geom
      FROM core.brgy_bndry x, bounds b
      WHERE x.geom && ST_Transform(b.geom, 4326)
    )
    SELECT ST_AsMVT(mvt.*, 'barangay', 4096, 'geom') AS tile
    FROM mvt
    WHERE geom IS NOT NULL
  `;
};

export async function loadBarangayMap(z: number, x: number, y: number) {
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
    console.warn("barangay_tile_controller.ts:", error);
    return { success: false as const, message: "Internal server error", status: 500 };
  }
}
