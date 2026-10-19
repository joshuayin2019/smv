// FILE: src/app/api/pages/smv/table/locate/route.ts  (new file; Next.js App Router)
// Adjust the import path, and add the same auth/session check your /table route has.
import { NextRequest, NextResponse } from "next/server";
import { locateSMV } from "@/lib/pages/smv/smv_locate";

export async function GET(req: NextRequest) {
  const res = await locateSMV(req.nextUrl.searchParams);
  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  // the table reads { found, reachable, page } straight from the body
  return NextResponse.json(res.data);
}
