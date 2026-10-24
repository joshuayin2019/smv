import { connection, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth/auth-service';
import { loadDashboard } from '@/lib/pages/dashboard/dashboard_controller';
import type { DashboardScopes } from '@/lib/pages/dashboard/dashboard_types';

export async function GET() {
  await connection();
  try {
    const token = (await cookies()).get('token')?.value;
    const auth = token ? await verifySession(token) : null;
    if (!auth) return NextResponse.json({ message: 'Please sign in.' }, { status: 401 });
    const scopes: DashboardScopes = { smv: auth.scope_smv ?? [], poi: auth.scope_poi ?? [],
      psa: auth.scope_psa ?? [], parcel: auth.scope_parcel ?? [] };
    return NextResponse.json(await loadDashboard(scopes), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.warn('Dashboard:', error);
    return NextResponse.json({ message: 'Could not load dashboard' }, { status: 500 });
  }
}
