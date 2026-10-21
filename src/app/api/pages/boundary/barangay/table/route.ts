// FILE: src/app/api/pages/boundary/city/table/route.ts
import { NextResponse } from "next/server";
import {
  loadBarangayTable,
  parseBarangayQuery,
} from "@/lib/pages/boundary/barangay/barangay_table_sql";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const { query, page, pageSize } = parseBarangayQuery(sp);

  const res = await loadBarangayTable(query, page, pageSize);

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  return NextResponse.json(res.data);
}