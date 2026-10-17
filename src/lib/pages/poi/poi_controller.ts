import { gzipSync } from "zlib";
import { conn } from "@/lib/db";

type PoiScopeItem = {
    scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
    code?: string | null;
};

// column per scope level
const LEVEL_COLUMN: Record<number, string> = {
    2: "reg_code",
    3: "pro_code",
    4: "mun_code",
};

// Tile queries use $1..$3 for z, x, y, so their scope params start at $4
const TILE_PARAM_OFFSET = 3;

// Tile zoom <= this returns clusters, above it returns the real points.
// Keep in sync with POI_POINTS_MINZOOM in the map component (POI_POINTS_MINZOOM = CLUSTER_MAX_ZOOM + 1).
export const CLUSTER_MAX_ZOOM = 16;

// Cluster cells per tile side. Lower = bigger, fewer clusters.
const GRID_CELLS = 6;
const WORLD_SIZE = 40075016.68557849; // EPSG:3857 world width in metres

// Zoom levels up to this one count the whole scope once and keep the cluster grid in memory.
// Above it, a tile covers a small area, so the live query (GiST index) is fast enough.
const WORLD_AGG_MAX_ZOOM = 10;

// Max queries running against Postgres at the same time (a zoom fires many tiles at once)
const MAX_CONCURRENT_QUERIES = 6;

const TILE_TTL_MS = 30 * 60 * 1000;
const TILE_CACHE_MAX = 2000;
const WORLD_TTL_MS = 30 * 60 * 1000;
const WORLD_CACHE_MAX = 40; // scope + zoom combinations kept in memory


// ---------------------------------------------------------------------------
// Scope key: the same scope always gives the same key (order and duplicates don't matter)
// ---------------------------------------------------------------------------

function normalizeScope(scope: unknown[]): PoiScopeItem[] {
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

const scopeKeyOf = (items: PoiScopeItem[]) => JSON.stringify(items);


// ---------------------------------------------------------------------------
// Caches and limiter
// ---------------------------------------------------------------------------

type CacheEntry = { at: number; tile: Buffer | null };
const tileCache = new Map<string, CacheEntry>();

// Identical tile requests that arrive while the first one is still running share its result
const inFlight = new Map<string, Promise<Buffer | null>>();

function cacheGet(key: string): CacheEntry | undefined {
    const hit = tileCache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > TILE_TTL_MS) {
        tileCache.delete(key);
        return undefined;
    }
    tileCache.delete(key); // re-insert to mark as most recently used
    tileCache.set(key, hit);
    return hit;
}

function cacheSet(key: string, tile: Buffer | null) {
    tileCache.set(key, { at: Date.now(), tile });
    if (tileCache.size > TILE_CACHE_MAX) {
        const oldest = tileCache.keys().next().value;
        if (oldest !== undefined) tileCache.delete(oldest);
    }
}

// Simple concurrency limiter: a finished query hands its slot straight to the next waiting one
let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
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


// ---------------------------------------------------------------------------
// Scope condition
// ---------------------------------------------------------------------------

// One condition for all scope items: a row matching several items is still returned once.
// `offset` = number of params already used before the scope params. cond is "" for "everything".
function buildScope(items: PoiScopeItem[], offset: number): { cond: string; params: string[] } | null {
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
// Low zoom: the whole scope is counted once per zoom level and kept in memory
// ---------------------------------------------------------------------------

type Cell = { point_count: number; cx: number; cy: number }; // cx, cy = cluster centre in EPSG:3857
type WorldGrid = Map<string, Cell[]>; // "tileX/tileY" -> the cells inside that tile

const worldCache = new Map<string, { at: number; grid: WorldGrid }>();
const worldInFlight = new Map<string, Promise<WorldGrid>>();

async function loadWorldGrid(z: number, scopeKey: string, items: PoiScopeItem[]): Promise<WorldGrid> {
    const key = `${scopeKey}|${z}`;

    const hit = worldCache.get(key);
    if (hit && Date.now() - hit.at <= WORLD_TTL_MS) return hit.grid;
    worldCache.delete(key);

    const pending = worldInFlight.get(key);
    if (pending) return pending;

    const job = (async (): Promise<WorldGrid> => {
        const grid: WorldGrid = new Map();
        const scope = buildScope(items, 0);
        if (!scope) return grid;

        const cell = WORLD_SIZE / 2 ** z / GRID_CELLS;
        const sql = `
            SELECT
                floor(ST_X(x.geom_3857) / ${cell}::float8)::int AS gx,
                floor(ST_Y(x.geom_3857) / ${cell}::float8)::int AS gy,
                count(*)::int AS point_count,
                avg(ST_X(x.geom_3857)) AS ax,
                avg(ST_Y(x.geom_3857)) AS ay
            FROM data.poi x
            WHERE x.geom_3857 IS NOT NULL
              ${scope.cond ? `AND ${scope.cond}` : ""}
            GROUP BY 1, 2
        `;
        const result = await withSlot(() => conn.query(sql, scope.params));

        // Cells are counted from the world centre, tiles from the top-left corner.
        // A tile owns exactly GRID_CELLS x GRID_CELLS cells, so the tile of a cell is plain integer math.
        const half = (GRID_CELLS * 2 ** z) / 2; // cells from the world centre to its edge
        for (const row of result.rows as Array<Record<string, number | string>>) {
            const gx = Number(row.gx);
            const gy = Number(row.gy);
            const tx = Math.floor((gx + half) / GRID_CELLS);
            const ty = Math.floor((half - 1 - gy) / GRID_CELLS);
            const tileKey = `${tx}/${ty}`;
            const list = grid.get(tileKey);
            const entry: Cell = { point_count: Number(row.point_count), cx: Number(row.ax), cy: Number(row.ay) };
            if (list) list.push(entry);
            else grid.set(tileKey, [entry]);
        }

        worldCache.set(key, { at: Date.now(), grid });
        if (worldCache.size > WORLD_CACHE_MAX) {
            const oldest = worldCache.keys().next().value;
            if (oldest !== undefined) worldCache.delete(oldest);
        }
        return grid;
    })().finally(() => {
        worldInFlight.delete(key);
    });

    worldInFlight.set(key, job);
    return job;
}

// Cells (at most GRID_CELLS x GRID_CELLS per tile) -> MVT. No table is read here.
const CLUSTER_FROM_CELLS_SQL = `
    WITH env AS (
        SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS g
    ),
    mvt AS (
        SELECT
            c.point_count,
            CASE
                WHEN c.point_count >= 1000000 THEN round(c.point_count / 1000000.0, 1)::text || 'M'
                WHEN c.point_count >= 1000 THEN round(c.point_count / 1000.0, 1)::text || 'k'
                ELSE c.point_count::text
            END AS point_count_abbreviated,
            ST_AsMVTGeom(
                ST_SetSRID(ST_MakePoint(c.cx, c.cy), 3857),
                env.g,
                4096,
                64,
                true
            ) AS geom
        FROM jsonb_to_recordset($4::jsonb) AS c(point_count int, cx float8, cy float8)
        CROSS JOIN env
    )
    SELECT ST_AsMVT(mvt.*, 'poi', 4096, 'geom') AS tile
    FROM mvt
    WHERE mvt.geom IS NOT NULL
`;


// ---------------------------------------------------------------------------
// Mid zoom: live clusters from data.poi (tiles are small, the GiST index does the work)
// ---------------------------------------------------------------------------

function clusterLiveSql(z: number, scopeCond: string): string {
    const cell = WORLD_SIZE / 2 ** z / GRID_CELLS;

    return `
        WITH env AS (
            SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS g
        ),
        cells AS (
            SELECT
                count(*)::int AS point_count,
                avg(ST_X(x.geom_3857)) AS cx,
                avg(ST_Y(x.geom_3857)) AS cy
            FROM data.poi x
            CROSS JOIN env
            WHERE x.geom_3857 IS NOT NULL
              ${scopeCond ? `AND ${scopeCond}` : ""}
              AND x.geom_3857 && env.g
            GROUP BY
                floor(ST_X(x.geom_3857) / ${cell}::float8),
                floor(ST_Y(x.geom_3857) / ${cell}::float8)
        ),
        mvt AS (
            SELECT
                c.point_count,
                CASE
                    WHEN c.point_count >= 1000000 THEN round(c.point_count / 1000000.0, 1)::text || 'M'
                    WHEN c.point_count >= 1000 THEN round(c.point_count / 1000.0, 1)::text || 'k'
                    ELSE c.point_count::text
                END AS point_count_abbreviated,
                ST_AsMVTGeom(
                    ST_SetSRID(ST_MakePoint(c.cx, c.cy), 3857),
                    env.g,
                    4096,
                    64,
                    true
                ) AS geom
            FROM cells c
            CROSS JOIN env
        )
        SELECT ST_AsMVT(mvt.*, 'poi', 4096, 'geom') AS tile
        FROM mvt
        WHERE mvt.geom IS NOT NULL
    `;
}


// ---------------------------------------------------------------------------
// High zoom: the real points, with only the properties the map needs
// ---------------------------------------------------------------------------

function pointSql(scopeCond: string): string {
    return `
        WITH env AS (
            -- small margin so points just outside the tile still draw across the edge
            SELECT
                ST_TileEnvelope($1::int, $2::int, $3::int) AS g,
                ST_TileEnvelope($1::int, $2::int, $3::int, margin => 0.015625) AS g_margin
        ),
        mvt AS (
            SELECT
                x.id,
                x.fid,
                x.name,
                z.name AS category,
                x.category_id,
                ST_AsMVTGeom(
                    x.geom_3857,
                    env.g,
                    4096,
                    64,
                    true
                ) AS geom
            FROM data.poi x
            INNER JOIN lookup.category z ON x.category_id = z.category_id
            CROSS JOIN env
            WHERE x.geom_3857 IS NOT NULL
              ${scopeCond ? `AND ${scopeCond}` : ""}
              AND x.geom_3857 && env.g_margin
        )
        SELECT ST_AsMVT(mvt.*, 'poi', 4096, 'geom') AS tile
        FROM mvt
        WHERE mvt.geom IS NOT NULL
    `;
}


// ---------------------------------------------------------------------------

async function buildTile(
    z: number,
    x: number,
    y: number,
    scopeKey: string,
    items: PoiScopeItem[]
): Promise<Buffer | null> {
    let sql: string;
    let params: unknown[];

    if (z <= WORLD_AGG_MAX_ZOOM) {
        const grid = await loadWorldGrid(z, scopeKey, items);
        const cells = grid.get(`${x}/${y}`);
        if (!cells || cells.length === 0) return null;
        sql = CLUSTER_FROM_CELLS_SQL;
        params = [z, x, y, JSON.stringify(cells)];
    } else {
        const scope = buildScope(items, TILE_PARAM_OFFSET);
        if (!scope) return null;
        sql = z <= CLUSTER_MAX_ZOOM ? clusterLiveSql(z, scope.cond) : pointSql(scope.cond);
        params = [z, x, y, ...scope.params];
    }

    const result = await withSlot(() => conn.query(sql, params));
    const raw = result.rows[0]?.tile as Buffer | null | undefined;
    return raw && raw.length > 0 ? gzipSync(raw) : null;
}

/**
 * Returns a gzipped MVT tile (send it with Content-Encoding: gzip),
 * or null when the scope is empty / the tile has no data.
 */
export async function loadPoiTile(
    z: number,
    x: number,
    y: number,
    scope: unknown
): Promise<Buffer | null> {
    if (!Number.isInteger(z) || z < 5 || z > 22) return null;
    if (!Array.isArray(scope) || scope.length === 0) return null;

    const items = normalizeScope(scope);
    if (items.length === 0) return null;
    const scopeKey = scopeKeyOf(items);

    const key = `${z}/${x}/${y}:${scopeKey}`;

    const hit = cacheGet(key);
    if (hit) return hit.tile;

    // same tile already being built (e.g. the map asked twice while zooming): wait for that one
    const pending = inFlight.get(key);
    if (pending) return pending;

    const job = buildTile(z, x, y, scopeKey, items)
        .then((tile) => {
            cacheSet(key, tile);
            return tile;
        })
        .finally(() => {
            inFlight.delete(key);
        });

    inFlight.set(key, job);
    return job;
}