import { loadSMVMap } from "@/lib/pages/smv/tile/tile_controller";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;
  const result = await loadSMVMap(Number(z), Number(x), Number(y));

  if (!result.success) {
    return new Response(result.message, { status: result.status });
  }

  if (!result.data) {
    return new Response(null, { status: 204 });
  }

  return new Response(new Uint8Array(result.data), {
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "public, max-age=300",
    },
  });
}