// FILE: src/app/api/pages/boundary/city/table/locate/route.ts
import { NextResponse } from "next/server";
import {
  locateMunicipality,
  parseMunicipalityQuery,
} from "@/lib/pages/boundary/city/municipality_table_sql";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const { query, pageSize } = parseMunicipalityQuery(sp);

  const id = Number(sp.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ message: "Bad Request" }, { status: 400 });
  }

  const res = await locateMunicipality(query, pageSize, id);

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  return NextResponse.json(res.data);
}