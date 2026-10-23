import { NextResponse } from 'next/server';
import { loadBuildingTypeCharts } from '@/lib/pages/demographic/type_of_buildings/type_of_buildings_charts_controller';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  let scope, bbox;
  try {
    scope = JSON.parse(sp.get('scope') ?? '[]');
    bbox = JSON.parse(sp.get('bbox') ?? '[]');
    if (!Array.isArray(scope) || scope.some(s => !s || typeof s !== 'object') ||
        !Array.isArray(bbox) || bbox.some(v => typeof v !== 'number')) throw new Error('Bad input');
  } catch {
    return NextResponse.json({ message: 'Bad chart query' }, { status: 400 });
  }
  const result = await loadBuildingTypeCharts(sp.get('level') ?? '', bbox, scope, sp.get('code') ?? undefined);
  return NextResponse.json(result.success ? result.data : { message: result.message }, {
    status: result.status, headers: { 'Cache-Control': 'private, no-store' },
  });
}
