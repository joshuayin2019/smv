import { conn } from "@/lib/db";
import type { Scope } from "@/stores/global_stores";

// scope_level: 1 = all, 2 = region, 3 = province, 4 = municipality
const LEVEL_COLUMN: Record<number, string> = {
  2: "x.reg_code",
  3: "x.pro_code",
  4: "x.mun_code",
};

// Returns null when the scope grants no access.
// firstParam is the index of the first SQL parameter this filter may use ($4 here).
function buildScopeFilter(scopes: Scope[], firstParam: number) {
  if (!Array.isArray(scopes) || scopes.length === 0) return null;

  // Level 1 already means "everything"
  if (scopes.some((s) => s.scope_level === 1)) {
    return { sql: "", params: [] as string[] };
  }

  const conditions: string[] = [];
  const params: string[] = [];

  for (const s of scopes) {
    const column = LEVEL_COLUMN[s.scope_level];
    if (!column || !s.code) continue; // unknown level or missing code: skip
    params.push(s.code);
    conditions.push(`${column} = $${firstParam + params.length - 1}`);
  }

  if (conditions.length === 0) return null;
  return { sql: ` AND (${conditions.join(" OR ")})`, params };
}

const tileSql = (scopeSql: string) => `
  WITH bounds AS (
    SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS geom
  ),
  mvt AS (
    SELECT
      x.id, x.osm_id, x.fclass, x.reg_code, x.pro_code, x.mun_code, x.bgy_code,
      x.reg_name, x.pro_name, x.mun_name, x.bgy_name,
      x.district, x.street, x.zone, x.smv_year,
      x.r, x.c, x.i, x.a,
      x.zv_rr, x.zv_cr, x.zv_i, x.zv_x, x.zv_rc, x.zv_cc, x.zv_ps,
      ST_AsMVTGeom(ST_Transform(x.geom, 3857), b.geom, 4096, 64, true) AS geom
    FROM data.smv x, bounds b
    WHERE x.geom && ST_Transform(b.geom, 4326)${scopeSql}
  )
  SELECT ST_AsMVT(mvt.*, 'smv', 4096, 'geom') AS tile
  FROM mvt
  WHERE geom IS NOT NULL
`;

export async function loadSMVMap(z: number, x: number, y: number, scope: Scope[]) {
  try {
    const max = 2 ** z;
    if (
      ![z, x, y].every(Number.isInteger) ||
      z < 0 || z > 22 ||
      x < 0 || y < 0 || x >= max || y >= max
    ) {
      return { success: false, message: "Bad tile coordinates", status: 400 };
    }

    const filter = buildScopeFilter(scope, 4);
    if (!filter) return { success: true, data: null }; // no access, empty tile

    const { rows } = await conn.query(tileSql(filter.sql), [z, x, y, ...filter.params]);
    const tile: Buffer | null = rows[0]?.tile ?? null;

    return { success: true, data: tile && tile.length > 0 ? tile : null };
  } catch (error) {
    console.warn("tile_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}