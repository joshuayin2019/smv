// src/lib/pages/smv/smv_scope.ts  (server only)
export type SmvScopeItem = {
  scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
  code: string | null;
};

const LEVEL_COLUMN: Record<number, string> = {
  2: "x.reg_code",
  3: "x.pro_code",
  4: "x.mun_code",
};

// The querystring carries the scope as JSON: [{"scope_level":3,"code":"PH137600000"}, ...]
export function parseScope(raw: string | null): SmvScopeItem[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const items: SmvScopeItem[] = [];
    for (const it of parsed) {
      if (!it || typeof it !== "object") continue;
      const { scope_level, code } = it as Record<string, unknown>;
      if (typeof scope_level !== "number") continue;
      items.push({ scope_level, code: code === null || code === undefined ? null : String(code) });
    }
    return items;
  } catch {
    return null;
  }
}

// One condition for all scope items. `offset` = params already used before the scope params.
// cond is "" for "everything"; null means the scope allows nothing.
export function buildScope(
  items: SmvScopeItem[],
  offset: number
): { cond: string; params: string[] } | null {
  if (items.some((i) => i.scope_level === 1)) return { cond: "", params: [] };

  const conditions: string[] = [];
  const params: string[] = [];
  for (const item of items) {
    const column = LEVEL_COLUMN[item.scope_level];
    if (!column || !item.code) continue;
    params.push(item.code);
    conditions.push(`${column} = $${offset + params.length}`);
  }
  if (conditions.length === 0) return null;
  return { cond: `(${conditions.join(" OR ")})`, params };
}