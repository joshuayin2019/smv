import { connection, NextResponse } from 'next/server';
import { parcelTile } from '@/lib/pages/parcel/parcel_controller';
import { parcelSession } from '@/lib/pages/parcel/parcel_session';

export async function GET(request: Request, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  await connection();
  try {
    const auth = await parcelSession();
    if (!auth) return new NextResponse(null, { status: 401 });
    const raw = await ctx.params;
    const z = Number(raw.z), x = Number(raw.x), y = Number(raw.y);
    if (![raw.z,raw.x,raw.y].every(v => /^\d+$/.test(v)) || ![z,x,y].every(Number.isInteger)
      || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2**z || y >= 2**z) return new NextResponse(null, { status: 400 });
    const tile = await parcelTile(auth.scope_parcel ?? [], new URL(request.url).searchParams, z,x,y);
    return new NextResponse(new Uint8Array(tile), { headers: {
      'Content-Type': 'application/vnd.mapbox-vector-tile', 'Cache-Control': 'private, no-store',
    } });
  } catch (error) {
    console.error('Parcel tile:', error);
    return new NextResponse(null, { status: 500 });
  }
}
