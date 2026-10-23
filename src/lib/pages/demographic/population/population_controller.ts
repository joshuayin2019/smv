import { conn } from "@/lib/db";
import type { Scope } from "@/stores/global_stores";

export const LEVELS = ["region", "province", "municipality", "barangay"] as const;
export type Level = (typeof LEVELS)[number];

export const isLevel = (v: unknown): v is Level => LEVELS.includes(v as Level);

// scope_level: 1 = all, 2 = region, 3 = province, 4 = municipality
// "b" is core.brgy_bndry (barangay) or data.psa_2020_municipalities (region, province, municipality).
// Both have reg_code, pro_code and mun_code, so the same filter works for every mode.
const LEVEL_COLUMN: Record<number, string> = {
  2: "b.reg_code",
  3: "b.pro_code",
  4: "b.mun_code",
};

// Returns null when the scope grants no access.
export function buildScopeFilter(scopes: Scope[], firstParam: number) {
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

/* ---------------- Grouping ---------------- */

// Region, province and municipality are built from data.psa_2020_municipalities, only the rows
// inside the scope: the population is their sum and the shape is their dissolved union.
const GROUP: Record<Exclude<Level, "barangay">, { key: string; name: string }> = {
  region: { key: "b.reg_code", name: "b.reg_name" },
  province: { key: "b.pro_code", name: "b.pro_name" },
  municipality: { key: "b.mun_code", name: "b.mun_name" },
};

/* ---------------- Level of detail by zoom ---------------- */

// Simplification tolerance in screen pixels. 0 = no simplification.
function simplifyPxFor(z: number): number {
  if (z <= 8) return 2;
  if (z <= 10) return 1.5;
  if (z <= 12) return 1;
  if (z <= 14) return 0.5;
  return 0;
}

const ENV_SQL = `
  env AS (
    SELECT
      ST_TileEnvelope($1::int, $2::int, $3::int) AS geom,
      (ST_XMax(ST_TileEnvelope($1::int, $2::int, $3::int))
        - ST_XMin(ST_TileEnvelope($1::int, $2::int, $3::int))) / 512.0 AS mpp
  )`;

const simplified = (geom3857: string, z: number) => {
  const px = simplifyPxFor(z);
  return px > 0 ? `ST_SimplifyPreserveTopology(${geom3857}, env.mpp * ${px})` : geom3857;
};

// Barangay: the original single-layer tile ("population"). The labels are drawn from the polygons.
const barangayTileSql = (scopeSql: string, z: number) => `
  WITH ${ENV_SQL},
  mvt AS (
    SELECT
      'barangay'::text AS level,
      b.bgy_code AS code,
      b.bgy_name AS name,
      COALESCE(p.population, 0)::int AS population,
      ST_AsMVTGeom(${simplified("ST_Transform(b.geom, 3857)", z)}, env.geom, 4096, 64, true) AS geom
    FROM core.brgy_bndry b
    JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
    CROSS JOIN env
    WHERE b.geom && ST_Transform(env.geom, ST_SRID(b.geom))${scopeSql}
  )
  SELECT ST_AsMVT(mvt.*, 'population', 4096, 'geom') AS tile
  FROM mvt
  WHERE geom IS NOT NULL
`;

// Region / province / municipality: only the municipalities in scope.
// Two layers in one tile: "population" (polygons) and "population_label" (one point per area).
const groupedTileSql = (level: Exclude<Level, "barangay">, scopeSql: string, z: number) => {
  const { key, name } = GROUP[level];

  // close the hairline gaps between the simplified municipalities after dissolving them
  const dissolved =
    level === "municipality"
      ? "geo.g"
      : "ST_Buffer(ST_Buffer(geo.g, 0.0002), -0.0002)";

  return `
    WITH ${ENV_SQL},
    sc AS (
      SELECT b.* FROM data.psa_2020_municipalities b WHERE TRUE${scopeSql}
    ),
    grp AS (
      SELECT ${key} AS code, MAX(${name}) AS name, SUM(b.population)::int AS population
      FROM sc b
      GROUP BY ${key}
    ),
    geo AS (
      SELECT ${key} AS code, ST_Union(b.geom) AS g
      FROM sc b CROSS JOIN env
      WHERE b.geom && ST_Transform(env.geom, 4326)
      GROUP BY ${key}
    ),
    polys AS (
      SELECT '${level}'::text AS level, grp.code, grp.name, grp.population,
             ST_AsMVTGeom(${simplified(`ST_Transform(${dissolved}, 3857)`, z)}, env.geom, 4096, 64, true) AS geom
      FROM grp
      JOIN geo ON geo.code = grp.code
      CROSS JOIN env
    ),
    pts AS (
      -- one label point per area: the label point of its largest municipality (same in every tile)
      SELECT DISTINCT ON (${key})
             '${level}'::text AS level, grp.code, grp.name, grp.population, b.lbl AS p
      FROM sc b
      JOIN grp ON grp.code = ${key}
      ORDER BY ${key}, b.population DESC
    ),
    lbl AS (
      SELECT level, code, name, population,
             ST_AsMVTGeom(ST_Transform(p, 3857), env.geom, 4096, 64, true) AS geom
      FROM pts CROSS JOIN env
    )
    SELECT
      COALESCE((SELECT ST_AsMVT(polys.*, 'population', 4096, 'geom') FROM polys WHERE geom IS NOT NULL), ''::bytea)
      ||
      COALESCE((SELECT ST_AsMVT(lbl.*, 'population_label', 4096, 'geom') FROM lbl WHERE geom IS NOT NULL), ''::bytea)
      AS tile
  `;
};

export async function loadPopulationMap(
  z: number,
  x: number,
  y: number,
  level: string,
  scope: Scope[]
) {
  try {
    const max = 2 ** z;
    if (
      ![z, x, y].every(Number.isInteger) ||
      z < 0 || z > 22 ||
      x < 0 || y < 0 || x >= max || y >= max
    ) {
      return { success: false, message: "Bad tile coordinates", status: 400 };
    }
    if (!isLevel(level)) return { success: false, message: "Bad level", status: 400 };

    // scope params start at $4
    const filter = buildScopeFilter(scope, 4);
    if (!filter) return { success: true, data: null }; // no access, empty tile

    const sql =
      level === "barangay"
        ? barangayTileSql(filter.sql, z)
        : groupedTileSql(level, filter.sql, z);

    const { rows } = await conn.query(sql, [z, x, y, ...filter.params]);
    const tile: Buffer | null = rows[0]?.tile ?? null;

    return { success: true, data: tile && tile.length > 0 ? tile : null };
  } catch (error) {
    console.warn("population_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}

/* ---------------- One area (region, province, municipality or barangay) ---------------- */

const validCode = (code: string) => /^[A-Za-z0-9_-]{1,32}$/.test(code);

// Full population coverage in the user's scope, independent of the current viewport.
export async function loadPopulationScopeExtent(scope: Scope[]) {
  try {
    const filter = buildScopeFilter(scope, 1);
    if (!filter) return { success: true, status: 200, data: null };
    const { rows } = await conn.query(
      `SELECT CASE WHEN bx IS NULL THEN NULL
              ELSE ARRAY[ST_XMin(bx), ST_YMin(bx), ST_XMax(bx), ST_YMax(bx)]::float8[] END AS bbox
       FROM (SELECT ST_Extent(b.geom) AS bx
             FROM data.psa_2020_municipalities b
             WHERE TRUE${filter.sql}) s`,
      filter.params
    );
    return { success: true, status: 200, data: rows[0]?.bbox ?? null };
  } catch (error) {
    console.warn("population scope extent:", error);
    return { success: false, status: 500, message: "Internal server error" };
  }
}

export async function loadPopulationById(level: string, code: string, scope: Scope[]) {
  try {
    if (!isLevel(level)) return { success: false, message: "Bad level", status: 400 };
    if (!validCode(code)) return { success: false, message: "Bad code", status: 400 };

    const filter = buildScopeFilter(scope, 2); // $1 is the code
    if (!filter) return { success: false, message: "Forbidden", status: 403 };

    let sql: string;
    if (level === "barangay") {
      sql = `SELECT 'barangay'::text AS level, b.bgy_code AS code, b.bgy_name AS name,
                    COALESCE(p.population, 0)::int AS population
             FROM core.brgy_bndry b
             LEFT JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
             WHERE b.bgy_code = $1${filter.sql}
             LIMIT 1`;
    } else {
      const { key, name } = GROUP[level];
      sql = `SELECT '${level}'::text AS level, ${key} AS code, MAX(${name}) AS name,
                    SUM(b.population)::int AS population
             FROM data.psa_2020_municipalities b
             WHERE ${key} = $1${filter.sql}
             GROUP BY ${key}`;
    }

    const { rows } = await conn.query(sql, [code, ...filter.params]);
    if (!rows[0]) return { success: false, message: "Not found", status: 404 };

    return { success: true, status: 200, data: rows[0] };
  } catch (error) {
    console.warn("population_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}

// Extent as [minLng, minLat, maxLng, maxLat] in EPSG:4326 (or null if no geometry)
export async function loadPopulationExtent(level: string, code: string, scope: Scope[]) {
  try {
    if (!isLevel(level)) return { success: false, message: "Bad level", status: 400 };
    if (!validCode(code)) return { success: false, message: "Bad code", status: 400 };

    const filter = buildScopeFilter(scope, 2); // $1 is the code
    if (!filter) return { success: false, message: "Forbidden", status: 403 };

    let inner: string;
    if (level === "barangay") {
      inner = `SELECT Box2D(ST_Transform(b.geom, 4326)) AS bx
               FROM core.brgy_bndry b
               WHERE b.bgy_code = $1${filter.sql}`;
    } else {
      const { key } = GROUP[level];
      // only the municipalities in scope, so the extent matches the drawn shape
      inner = `SELECT ST_Extent(b.geom) AS bx
               FROM data.psa_2020_municipalities b
               WHERE ${key} = $1${filter.sql}`;
    }

    const { rows } = await conn.query(
      `SELECT CASE
                WHEN s.bx IS NULL THEN NULL
                ELSE ARRAY[ST_XMin(s.bx), ST_YMin(s.bx), ST_XMax(s.bx), ST_YMax(s.bx)]::float8[]
              END AS bbox
       FROM (${inner}) s`,
      [code, ...filter.params]
    );

    return { success: true, status: 200, data: rows[0]?.bbox ?? null };
  } catch (error) {
    console.warn("population_controller.ts:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}
