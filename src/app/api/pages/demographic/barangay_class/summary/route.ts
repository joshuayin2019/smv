import { NextResponse } from 'next/server';
import { parseClassQuery, loadClassSummary } from '@/lib/pages/demographic/barangay_class/barangay_class_controller';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const parsed = parseClassQuery(sp);
  if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });
  
  try {
    return NextResponse.json(await loadClassSummary(parsed.query), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.warn('Barangay class summary:', error);
    return NextResponse.json({ message: 'Could not load barangay classes' }, { status: 500 });
  }
}
