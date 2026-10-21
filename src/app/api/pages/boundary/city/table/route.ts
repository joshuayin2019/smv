// FILE: src/app/api/pages/boundary/city/table/route.ts
import { NextResponse } from "next/server";
import {
  loadMunicipalityTable,
  parseMunicipalityQuery,
} from "@/lib/pages/boundary/city/municipality_table_sql";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const { query, page, pageSize } = parseMunicipalityQuery(sp);

  const res = await loadMunicipalityTable(query, page, pageSize);

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  return NextResponse.json(res.data);
}