import { NextResponse } from "next/server";
import type { Scope } from "@/stores/global_stores";
import {
  loadBuildingTypeSummary,
  type PopFilter,
} from "@/lib/pages/demographic/type_of_buildings/type_of_buildings_summary_controller";

const toJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;

  const result = await loadBuildingTypeSummary(
    {
      level: sp.get("level") ?? "",
      groupBy: sp.get("groupBy") ?? undefined,
      measure: sp.get("measure") ?? undefined,
      limit: Number(sp.get("limit")) || undefined,
      search: sp.get("search") ?? undefined,
      filters: toJson<Record<string, string>>(sp.get("filters"), {}),
      pop: toJson<PopFilter | null>(sp.get("pop"), null),
    },
    toJson<Scope[]>(sp.get("scope"), [])
  );

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 200 });
}