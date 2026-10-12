import { conn } from "@/lib/db";

type PoiScopeItem = {
    scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
    code?: string;
};

const emptyCollection = { type: "FeatureCollection", features: [] as unknown[] };

const SELECT_POI = `
    SELECT json_build_object(
        'type', 'Feature',
        'id', x.id,
        'geometry', ST_AsGeoJSON(
            ST_Transform(
                ST_SetSRID(x.geom, (
                    SELECT srid
                    FROM public.geometry_columns
                    WHERE f_table_schema = 'data'
                      AND f_table_name = 'poi'
                )),
            4326)
        )::json,
        'properties', json_build_object(
            'fid', x.fid,
            'id', x.fid,
            'name', x.name,
            'category', z.name,
            'category_id', x.category_id,
            'ft_traffic', x.ft_traffic,
            'rd_name', x.rd_name,
            'as_of', x.as_of,
            'barangay', x.bgy_name,
            'district', '',
            'city_municipality', x.mun_name,
            'province', x.pro_name,
            'region', x.reg_name,
            'filename', x.filename,
            'reg_code', x.reg_code,
            'pro_code', x.pro_code,
            'mun_code', x.mun_code,
            'bgy_code', x.bgy_code
        )
    ) AS feature
    FROM data.poi x
    INNER JOIN lookup.category z ON x.category_id = z.category_id
`;

const LEVEL_COLUMN: Record<number, string> = {
    2: "x.reg_code",
    3: "x.pro_code",
    4: "x.mun_code",
};

const GEOM_FILTER = "x.geom IS NOT NULL";

// One WHERE for all scope items: a row matching several items is still returned once
function buildWhere(items: PoiScopeItem[]): { where: string; params: string[] } | null {
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

export async function loadPoi(scope: unknown){
    try {
        if (!Array.isArray(scope) || scope.length === 0) return emptyCollection;

        const q = buildWhere(scope as PoiScopeItem[]);
        if (!q) return emptyCollection;

        const result = await conn.query(`${SELECT_POI} ${q.where}`, q.params);

        return {
            type: "FeatureCollection",
            features: result.rows.map((row) => row.feature).filter(Boolean),
        };
    } catch (err){
         console.warn("poi_controller:", err);
         return { error: err instanceof Error ? err.message : String(err) };
    }
}