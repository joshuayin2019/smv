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