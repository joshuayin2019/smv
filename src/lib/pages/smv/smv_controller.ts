import { conn } from "@/lib/db";

type SmvScopeItem = {
    scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
    code?: string;
};

const SELECT_SMV = `
    SELECT x.id, x.objectid, x.fid_ncr_ro, x.osm_id, x.code, x.fclass, x.reg_code, x.pro_code, 
	x.mun_code, x.bgy_code, x.reg_name, x.pro_name, x.mun_name, 
	x.bgy_name, x.district, x.zone, x.street, x.smv_year, x.r, x.c, x.i, x.a, x.flg, x.dist
	FROM data.smv x
`;

const LEVEL_COLUMN: Record<number, string> = {
    2: "x.reg_code",
    3: "x.pro_code",
    4: "x.mun_code",
};

const GEOM_FILTER = "x.geom IS NOT NULL";

// One WHERE for all scope items: a row matching several items is still returned once
function buildWhere(items: SmvScopeItem[]): { where: string; params: string[] } | null {
    // Level 1 already means "everything"
    if (items.some((i) => i.scope_level === 1)) {
        return { where: `WHERE ${GEOM_FILTER}`, params: [] };
    }

    const conditions: string[] = [];
    const params: string[] = [];

    for (const item of items) {
        const column = LEVEL_COLUMN[item.scope_level];
        if (!column || !item.code) continue; // unknown level or missing code: skip
        params.push(item.code);
        conditions.push(`${column} = $${params.length}`);
    }

    if (conditions.length === 0) return null;
    return { where: `WHERE ${GEOM_FILTER} AND (${conditions.join(" OR ")})`, params };
}

export async function loadSmv(scope: unknown) {
    try {
        if (!Array.isArray(scope) || scope.length === 0) return [];

        const q = buildWhere(scope as SmvScopeItem[]);
        if (!q) return [];

        const result = await conn.query(`${SELECT_SMV} ${q.where}`, q.params);
        return result.rows;
    } catch (err) {
        console.warn("smv_controller:", err);
        return { error: err instanceof Error ? err.message : String(err) };
    }
}



// Roads that touch a circle: the real MultiLineString is checked, not a single point
export async function loadSmvRadius(scope: unknown, lat: unknown, lng: unknown, m: unknown) {
    try {
        if (!Array.isArray(scope) || scope.length === 0) return [];

        const latN = Number(lat);
        const lngN = Number(lng);
        const meters = Math.min(Math.max(Number(m), 1), 200_000); // clamp: 1 m .. 200 km
        if (![latN, lngN, meters].every(Number.isFinite)) return { error: "invalid radius" };

        const q = buildWhere(scope as SmvScopeItem[]);
        if (!q) return [];

        // bounding box in degrees, wide enough in longitude too
        const delta = meters / 1000 / (111.32 * Math.cos((latN * Math.PI) / 180));

        const n = q.params.length;
        const sql = `
            SELECT x.id,
                   ST_Distance(x.geom::geography, c.pt::geography) AS distance_m
            FROM data.smv x
            CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint($${n + 1}::float8, $${n + 2}::float8), 4326) AS pt) c
            ${q.where}
              AND x.geom && ST_Expand(c.pt, $${n + 3}::float8)
              AND ST_DWithin(x.geom::geography, c.pt::geography, $${n + 4}::float8)
        `;
        const result = await conn.query(sql, [...q.params, lngN, latN, delta, meters]);
        return result.rows;
    } catch (err) {
        console.warn("smv_controller radius:", err);
        return { error: err instanceof Error ? err.message : String(err) };
    }
}