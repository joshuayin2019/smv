import { NextResponse } from 'next/server';
import { parseClassQuery, locateClass } from '@/lib/pages/demographic/barangay_class/barangay_class_controller';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const parsed = parseClassQuery(sp);
  if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });
  const code = sp.get('id') ?? '';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return NextResponse.json({ message: 'Bad code' }, { status: 400 });
  try {
    return NextResponse.json(await locateClass(parsed.query, code), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.warn('Barangay class table/locate:', error);
    return NextResponse.json({ message: 'Could not load barangay classes' }, { status: 500 });
  }
}
