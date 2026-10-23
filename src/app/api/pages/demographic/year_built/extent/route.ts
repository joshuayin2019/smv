import { NextResponse } from "next/server";
import type { Scope } from "@/stores/global_stores";
import { loadYearBuiltExtent, loadYearBuiltScopeExtent } from "@/lib/pages/demographic/year_built/year_built_controller";

export async function GET(request: Request) {
  let scope: Scope[];
  try {
    scope = JSON.parse(new URL(request.url).searchParams.get("scope") ?? "[]");
    if (!Array.isArray(scope) || scope.some((s) => !s || typeof s !== "object")) {
      return NextResponse.json({ message: "Bad scope" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ message: "Bad scope" }, { status: 400 });
  }
  const sp = new URL(request.url).searchParams;
  const code = sp.get("code");
  const level = sp.get("level");
  if ((code !== null || level !== null) && (!code || !level)) {
    return NextResponse.json({ message: "Both level and code are required" }, { status: 400 });
  }
  const result = code && level
    ? await loadYearBuiltExtent(level, code, scope)
    : await loadYearBuiltScopeExtent(scope);
  return NextResponse.json(result.success ? result.data : { message: result.message }, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
