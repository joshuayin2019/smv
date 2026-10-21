
import { NextResponse } from "next/server";
import {
  locateBarangay,
  parseBarangayQuery,
} from "@/lib/pages/boundary/barangay/barangay_table_sql";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const { query, pageSize } = parseBarangayQuery(sp);

  const id = Number(sp.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ message: "Bad Request" }, { status: 400 });
  }

  const res = await locateBarangay(query, pageSize, id);

  if (!res.success) {
    return NextResponse.json({ message: res.message }, { status: res.status });
  }
  return NextResponse.json(res.data);
}