import { NextResponse } from 'next/server';
import { loadDashboard } from '@/lib/pages/dashboard/dashboard_controller';
import type { DashboardScopes } from '@/lib/pages/dashboard/dashboard_types';

export async function GET(request: Request) {
  let scopes: DashboardScopes;
  try {
    scopes = JSON.parse(new URL(request.url).searchParams.get('scopes') ?? '{}');
    for (const key of ['smv', 'poi', 'psa'] as const) {
      if (!Array.isArray(scopes?.[key]) || scopes[key].some(s => !s || typeof s.scope_level !== 'number' ||
        (s.code !== null && typeof s.code !== 'string'))) throw new Error('Bad scopes');
    }
  } catch {
    return NextResponse.json({ message: 'Bad dashboard scopes' }, { status: 400 });
  }
  try {
    return NextResponse.json(await loadDashboard(scopes), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.warn('Dashboard:', error);
    return NextResponse.json({ message: 'Could not load dashboard' }, { status: 500 });
  }
}
