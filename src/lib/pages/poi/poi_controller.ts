import { conn } from "@/lib/db";

type PoiScopeItem = {
    scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
    code?: string;
};

const emptyCollection = { type: "FeatureCollection", features: [] as unknown[] };

const SELECT_POI = `
    SELECT json_build_object(
        'type', 'Feature',
        'id', x.fid,
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
            'category_id', z.category_id,
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
            'mun_code', x.mun_code
        )
    ) AS feature
    FROM data.poi x
    INNER JOIN core.brgy_bndry y ON x.bgy_code = y.bgy_code
    INNER JOIN lookup.category z ON x.category_id = z.category_id
`;

function buildWhere(item: PoiScopeItem): { where: string; params: string[] } | null {
    switch (item.scope_level) {
        case 1:
            return { where: "", params: [] };
        case 2:
            return item.code ? { where: "WHERE y.reg_code = $1", params: [item.code] } : null;
        case 3:
            return item.code ? { where: "WHERE y.pro_code = $1", params: [item.code] } : null;
        case 4:
            if (!item.code) return null;
            // City of Manila is matched at province level
            return item.code === "PH133900000"
                ? { where: "WHERE y.pro_code = $1", params: [item.code] }
                : { where: "WHERE y.mun_code = $1", params: [item.code] };
        default:
            return null; // unknown level: skip instead of running an unfiltered query
    }
}

export async function loadPoi(scope: unknown){
    try {
        if (!Array.isArray(scope) || scope.length === 0) return emptyCollection;

        const items = scope as PoiScopeItem[];
        
        // Level 1 already means "everything", so one query is enough
        const queries = items.some((i) => i.scope_level === 1)
            ? [{ where: "", params: [] as string[] }]
            : items.map(buildWhere).filter((q): q is NonNullable<typeof q> => q !== null);

        const unique = new Map<number | string, unknown>();

        for (const q of queries) {
            const result = await conn.query(`${SELECT_POI} ${q.where}`, q.params);
            for (const row of result.rows) {
                const feature = row.feature;
                if (!feature || feature.id == null) continue;
                if (!unique.has(feature.id)) unique.set(feature.id, feature);
            }
        }

        return { type: "FeatureCollection", features: Array.from(unique.values()) };
    } catch (err){
         console.warn("poi_controller:", err);
         return { error: err instanceof Error ? err.message : String(err) };
    }
}