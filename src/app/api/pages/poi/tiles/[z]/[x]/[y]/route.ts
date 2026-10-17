import { NextRequest, NextResponse } from "next/server";
import { loadPoiTile } from "@/lib/pages/poi/poi_controller";

type Ctx = { params: Promise<{ z: string; x: string; y: string }> };

// The tile url contains the scope, so the browser cache is automatically per scope.
// Browser keeps tiles for 5 minutes, so panning back over an area does not refetch.
const CACHE_CONTROL = "private, max-age=300";

type ScopeItem = { scope_level: number; code: string | null };

// ?scope=[{"scope_level":1,"code":null}, ...]  ->  validated array, or null when missing/invalid
function parseScope(raw: string | null): ScopeItem[] | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        const items: ScopeItem[] = [];
        for (const it of parsed) {
            if (!it || typeof it !== "object") return null;
            const { scope_level, code } = it as Record<string, unknown>;
            if (typeof scope_level !== "number") return null;
            items.push({
                scope_level,
                code: code === null || code === undefined ? null : String(code),
            });
        }
        return items;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest, { params }: Ctx) {
    try {
        const { z, x, y } = await params;
        const zi = Number(z);
        const xi = Number(x);
        const yi = Number(y);

        if (
            !Number.isInteger(zi) || !Number.isInteger(xi) || !Number.isInteger(yi) ||
            zi < 0 || zi > 22 || xi < 0 || yi < 0 ||
            xi >= 2 ** zi || yi >= 2 ** zi
        ) {
            return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
        }

        // Scope sent by the map (auth.scope_poi). Missing or invalid = empty tile.
        const scope = parseScope(req.nextUrl.searchParams.get("scope"));
        if (!scope) {
            return new Response(null, { status: 204 });
        }

        const tile = await loadPoiTile(zi, xi, yi, scope);

        // 204 = empty tile, MapLibre handles it fine
        if (!tile) {
            return new Response(null, {
                status: 204,
                headers: { "Cache-Control": CACHE_CONTROL },
            });
        }

        return new NextResponse(new Uint8Array(tile), {
            status: 200,
            headers: {
                "Content-Type": "application/x-protobuf",
                "Content-Encoding": "gzip", // the controller already gzipped the tile
                "Cache-Control": CACHE_CONTROL,
            },
        });
    } catch (err) {
        console.warn("poi tile route:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}