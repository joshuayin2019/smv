import { connection, NextResponse } from 'next/server';
import { parcelSession } from '@/lib/pages/parcel/parcel_session';
import { parcelSummary } from '@/lib/pages/parcel/parcel_controller';

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await parcelSession();
    if (!auth) return NextResponse.json({ message: 'Please sign in.' },{ status: 401 });
    return NextResponse.json(await parcelSummary(auth.scope_parcel ?? [],new URL(request.url).searchParams),{ headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Parcel summary:',error);
    return NextResponse.json({ message: 'Unable to load parcel summary.' },{ status: 500 });
  }
}
