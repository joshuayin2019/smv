import { connection, NextResponse } from 'next/server';
import { loadParcel, loadParcels, locateParcel } from '@/lib/pages/parcel/parcel_controller';
import { parcelSession } from '@/lib/pages/parcel/parcel_session';

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await parcelSession();
    if (!auth) return NextResponse.json({ message: 'Please sign in.' }, { status: 401 });
    const sp = new URL(request.url).searchParams;
    const id = sp.get('id');
    const data = id !== null ? sp.get('locate') === '1'
      ? await locateParcel(auth.scope_parcel ?? [],sp,id)
      : await loadParcel(auth.scope_parcel ?? [], id) : await loadParcels(auth.scope_parcel ?? [], sp);
    if (!data) return NextResponse.json({ message: 'Parcel not found in your assigned scope.' }, { status: 404 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Parcel data:', error);
    return NextResponse.json({ message: 'Unable to load parcels. Please retry.' }, { status: 500 });
  }
}
