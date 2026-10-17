// lib/poi_scope.ts
// Scope handling and the Postgres query limiter, shared by the tile controller and the table routes,
// so the map and the table always apply exactly the same rules.

export type PoiScopeItem = {
    scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
    code?: string | null;
};

// column per scope level
const LEVEL_COLUMN: Record<number, string> = {
    2: "reg_code",
    3: "pro_code",
    4: "mun_code",
};

// Max queries running against Postgres at the same time (a zoom fires many tiles at once)
const MAX_CONCURRENT_QUERIES = 6;


// ---------------------------------------------------------------------------
// Scope key: the same scope always gives the same key (order and duplicates don't matter)
// ---------------------------------------------------------------------------

export function normalizeScope(scope: unknown[]): PoiScopeItem[] {
    const items: PoiScopeItem[] = [];
    for (const raw of scope) {
        if (!raw || typeof raw !== "object") continue;
        const { scope_level, code } = raw as Record<string, unknown>;
        if (typeof scope_level !== "number") continue;
        items.push({ scope_level, code: code === null || code === undefined ? null : String(code) });
    }

    // Level 1 already means "everything"
    if (items.some((i) => i.scope_level === 1)) return [{ scope_level: 1, code: null }];

    items.sort((a, b) => a.scope_level - b.scope_level || String(a.code).localeCompare(String(b.code)));
    return items.filter(
        (it, i) => i === 0 || it.scope_level !== items[i - 1].scope_level || it.code !== items[i - 1].code
    );
}

export const scopeKeyOf = (items: PoiScopeItem[]) => JSON.stringify(items);

// The `scope` query parameter (JSON of the user's scope_poi) -> normalized items.
// null = missing, invalid or empty scope, which means "no access" (same as the tile route).
export function parseScope(raw: string | null): PoiScopeItem[] | null {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (!Array.isArray(value) || value.length === 0) return null;
        const items = normalizeScope(value);
        return items.length > 0 ? items : null;
    } catch {
        return null;
    }
}


// ---------------------------------------------------------------------------
// Scope condition (columns are read from the table aliased as `x`)
// ---------------------------------------------------------------------------

// One condition for all scope items: a row matching several items is still returned once.
// `offset` = number of params already used before the scope params. cond is "" for "everything".
// null = nothing usable in the scope -> the caller returns no data.
export function buildScope(items: PoiScopeItem[], offset: number): { cond: string; params: string[] } | null {
    if (items.some((i) => i.scope_level === 1)) return { cond: "", params: [] };

    const conditions: string[] = [];
    const params: string[] = [];

    for (const item of items) {
        const column = LEVEL_COLUMN[item.scope_level];
        if (!column || !item.code) continue; // unknown level or missing code: skip
        params.push(item.code);
        conditions.push(`x.${column} = $${offset + params.length}`);
    }

    if (conditions.length === 0) return null;
    return { cond: `(${conditions.join(" OR ")})`, params };
}


// ---------------------------------------------------------------------------
// Concurrency limiter: a finished query hands its slot straight to the next waiting one.
// Tiles and table requests share the same slots, so a busy table cannot starve the map (and vice versa).
// ---------------------------------------------------------------------------

let running = 0;
const waiting: Array<() => void> = [];

export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (running < MAX_CONCURRENT_QUERIES) {
        running++;
    } else {
        await new Promise<void>((resolve) => waiting.push(resolve)); // slot is handed over
    }
    try {
        return await fn();
    } finally {
        const next = waiting.shift();
        if (next) next();
        else running--;
    }
}
