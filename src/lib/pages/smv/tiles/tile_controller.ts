import { conn } from "@/lib/db";
import type { Scope } from "@/stores/global_stores";

// scope_level: 1 = all, 2 = region, 3 = province, 4 = municipality
const LEVEL_COLUMN: Record<number, string> = {
  2: "x.reg_code",
  3: "x.pro_code",
  4: "x.mun_code",
};

// Returns null when the scope grants no access.
function buildScopeFilter(scopes: Scope[], firstParam: number) {
  if (!Array.isArray(scopes) || scopes.length === 0) return null;

  if (scopes.some((s) => s.scope_level === 1)) {
    return { sql: "", params: [] as string[] };
  }

  const conditions: string[] = [];
  const params: string[] = [];

  for (const s of scopes) {
    const column = LEVEL_COLUMN[s.scope_level];
    if (!column || !s.code) continue;
    params.push(s.code);
    conditions.push(`${column} = $${firstParam + params.length - 1}`);
  }

  if (conditions.length === 0) return null;
  return { sql: ` AND (${conditions.join(" OR ")})`, params };
}

/* ---------------- Level of detail by zoom ---------------- */

// TODO: check these against your data:  SELECT DISTINCT fclass FROM data.smv;
const MAJOR = ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"];
const SECONDARY = [...MAJOR, "secondary", "secondary_link"];
const TERTIARY = [...SECONDARY, "tertiary", "tertiary_link"];
const LOCAL = [...TERTIARY, "unclassified", "residential"];

// Road classes to send at each zoom. null = every class.
function fclassesFor(z: number): string[] | null {
  if (z <= 7) return MAJOR;
  if (z <= 10) return SECONDARY;
  if (z <= 12) return TERTIARY;
  if (z <= 14) return LOCAL;
  return null;
}

// Simplification tolerance in screen pixels. 0 = no simplification.
function simplifyPxFor(z: number): number {
  if (z <= 10) return 1.5;
  if (z <= 12) return 1;
  if (z <= 14) return 0.7;
  return 0;
}

// Below this zoom, only send the few attributes the single-color layer needs
const FULL_DETAIL_ZOOM = 16;

const LITE_COLS = `x.id, x.fclass, x.r, x.c, x.i, x.a`;

const FULL_COLS = `
  x.id, x.osm_id, x.fclass, x.reg_code, x.pro_code, x.mun_code, x.bgy_code,
  x.reg_name, x.pro_name, x.mun_name, x.bgy_name,
  x.district, x.street, x.zone, x.smv_year,
  x.r, x.c, x.i, x.a,
  x.zv_rr, x.zv_cr, x.zv_i, x.zv_x, x.zv_rc, x.zv_cc, x.zv_ps
`;

const tileSql = (scopeSql: string, z: number) => {
  const cols = z < FULL_DETAIL_ZOOM ? LITE_COLS : FULL_COLS;
  const px = simplifyPxFor(z);

  // mpp = meters per screen pixel at this zoom (512px tiles)
  const geomExpr =
    px > 0
      ? `ST_Simplify(ST_Transform(x.geom, 3857), b.mpp * ${px}, true)`
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
        ${cols},
        ST_AsMVTGeom(${geomExpr}, b.geom, 4096, 64, true) AS geom
      FROM data.smv x, bounds b
      WHERE x.geom && ST_Transform(b.geom, 4326)
        AND ($4::text[] IS NULL OR x.fclass = ANY($4::text[]))${scopeSql}
    )
    SELECT ST_AsMVT(mvt.*, 'smv', 4096, 'geom') AS tile
    FROM mvt
    WHERE geom IS NOT NULL
  `;
};

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

    // scope params start at $5 ($4 is the fclass list)
    const filter = buildScopeFilter(scope, 5);
    if (!filter) return { success: true, data: null }; // no access, empty tile

    const { rows } = await conn.query(tileSql(filter.sql, z), [
      z,
      x,
      y,
      fclassesFor(z),
      ...filter.params,
    ]);
    const tile: Buffer | null = rows[0]?.tile ?? null;

    return { success: true, data: tile && tile.length > 0 ? tile : null };
  } catch (error) {
    console.warn("tile_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}