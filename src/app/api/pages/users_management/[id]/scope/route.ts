import { NextResponse } from "next/server";
import {
  loadUserScopes,
  replaceUserScopes,
  type ScopeInput,
} from "@/lib/pages/users_management/users_management_controller";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    return NextResponse.json(await loadUserScopes(id));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load scope" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const { scopes } = await req.json();
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({ error: "Add at least one scope" }, { status: 400 });
    }

    const clean: ScopeInput[] = [];
    for (const s of scopes) {
      const lvl = Number(s.scope_level);
      if (![1, 2, 3, 4].includes(lvl)) {
        return NextResponse.json({ error: "Invalid scope level" }, { status: 400 });
      }
      const reg = lvl >= 2 ? s.reg_code ?? null : null;
      const pro = lvl >= 3 ? s.pro_code ?? null : null;
      const mun = lvl >= 4 ? s.mun_code ?? null : null;
      if ((lvl >= 2 && !reg) || (lvl >= 3 && !pro) || (lvl >= 4 && !mun)) {
        return NextResponse.json({ error: "A scope is missing its region, province or city" }, { status: 400 });
      }
      if (!s.poi && !s.smv && !s.psa && !s.parcel) {
        return NextResponse.json({ error: "Each scope needs at least one module" }, { status: 400 });
      }
      clean.push({
        scope_level: lvl, reg_code: reg, pro_code: pro, mun_code: mun,
        poi: !!s.poi, smv: !!s.smv, psa: !!s.psa,
        parcel: !!s.parcel,
      });
    }

    const ok = await replaceUserScopes(id, clean);
    if (!ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save scope" }, { status: 500 });
  }
}
