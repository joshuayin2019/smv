import { loadSMVMap } from "@/lib/pages/smv/tile/tile_controller";
import type { Scope } from "@/stores/global_stores";

function parseScope(raw: string | null): Scope[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const ok = v.every(
      (s) =>
        s &&
        Number.isInteger(s.scope_level) &&
        (s.code === null || typeof s.code === "string" || typeof s.code === "number")
    );
    return ok ? (v as Scope[]) : null;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const scope = parseScope(new URL(req.url).searchParams.get("scope"));
  if (!scope) return new Response("Bad scope", { status: 400 });

  const { z, x, y } = await params;
  const result = await loadSMVMap(Number(z), Number(x), Number(y), scope);

  if (!result.success) {
    return new Response(result.message, { status: result.status });
  }

  if (!result.data) {
    return new Response(null, { status: 204 });
  }

  return new Response(new Uint8Array(result.data), {
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      // scope is part of the URL, so each scope gets its own cache entry
      "Cache-Control": "public, max-age=300",
    },
  });
}