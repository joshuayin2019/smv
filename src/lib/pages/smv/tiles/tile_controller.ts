// FILE: src/lib/pages/smv/tile_controller.ts  (replace your tile controller; adjust the path to where yours lives)
import { conn } from "@/lib/db";
import type { Scope } from "@/stores/global_stores";
import { ROW_SELECT } from "@/lib/pages/smv/smv_table_sql";

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

// Tiles carry only what the map needs to DRAW and to identify a road:
// id (to select), fclass (line width in the overview), r/c/i/a (colors, widths, filters).
// Everything else is loaded by id when a road is selected (see loadSMVById).
const TILE_COLS = `x.id, x.fclass, x.r, x.c, x.i, x.a`;

const tileSql = (scopeSql: string, z: number) => {
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
        ${TILE_COLS},
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

/* ---------------- One road, full attributes ---------------- */

// Same fields (and the same bbox of the WHOLE road) that the table rows have: ROW_SELECT
export async function loadSMVById(id: string, scope: Scope[]) {
  try {
    if (!/^\d{1,15}$/.test(id)) return { success: false, message: "Bad id", status: 400 };

    // the scope filter still applies, so nobody can fetch a road outside their area
    const filter = buildScopeFilter(scope, 2); // $1 is the id
    if (!filter) return { success: false, message: "Forbidden", status: 403 };

    const { rows } = await conn.query(
      `SELECT ${ROW_SELECT} FROM data.smv x WHERE x.id = $1${filter.sql} LIMIT 1`,
      [Number(id), ...filter.params]
    );
    if (!rows[0]) return { success: false, message: "Not found", status: 404 };

    return { success: true, data: rows[0] };
  } catch (error) {
    console.warn("tile_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}
