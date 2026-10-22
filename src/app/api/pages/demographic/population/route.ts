import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Geometry } from "geojson";
import { conn } from "@/lib/db";
import { verifySession } from "@/lib/auth/auth-service";
import { buildScope, normalizeScope } from "@/lib/pages/poi/poi_scope";

// export const runtime = "nodejs";
const LIMIT = 500;

export async function GET(request: Request) {
  const parts = new URL(request.url).searchParams.get("bbox")?.split(",");
  const bbox = parts?.map(Number);
  if (!parts || parts.some((p) => !p.trim()) || !bbox || bbox.length !== 4 ||
      !bbox.every(Number.isFinite) || bbox[0] < -180 || bbox[2] > 180 ||
      bbox[1] < -90 || bbox[3] > 90 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    return NextResponse.json({ error: "Valid bbox=west,south,east,north required" }, { status: 400 });
  }
  try {
    const token = (await cookies()).get("token")?.value;
    const user = token ? await verifySession(token) : null;
    if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const scope = buildScope(normalizeScope(user.scope_psa ?? []), 4);
    if (!scope) return NextResponse.json({ error: "No population scope assigned" }, { status: 403 });

    // Aggregate census rows and boundaries separately: duplicate boundary parts must
    // not multiply the population totals during the join. Geometry keeps its stored SRID.
    const { rows } = await conn.query<{
      bgy_code: string; bgy_name: string; population: string;
      male: string | null; female: string | null; geometry: Geometry;
    }>(`
      WITH boundaries AS (
        SELECT x.bgy_code, MAX(x.bgy_name) AS bgy_name, ST_Union(x.geom) AS geom
        FROM core.brgy_bndry x
        WHERE x.geom && ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326), ST_SRID(x.geom))
          ${scope.cond ? `AND ${scope.cond}` : ""}
        GROUP BY x.bgy_code
      ), totals AS (
        SELECT a.bar_code, SUM(a.population::numeric) AS population,
          SUM(a.sex_male::numeric) AS male, SUM(a.sex_female::numeric) AS female
        FROM data.psa_2020 a
        INNER JOIN boundaries b ON b.bgy_code = a.bar_code
        GROUP BY a.bar_code
      )
      SELECT b.bgy_code, b.bgy_name, t.population, t.male, t.female,
        ST_AsGeoJSON(ST_Transform(b.geom,4326),6)::json AS geometry
      FROM boundaries b INNER JOIN totals t ON t.bar_code = b.bgy_code
      ORDER BY b.bgy_code LIMIT ${LIMIT + 1}
    `, [...bbox, ...scope.params]);
    const features = rows.slice(0, LIMIT).map((r) => ({
      type: "Feature" as const, id: r.bgy_code, geometry: r.geometry,
      properties: { bgy_code: r.bgy_code, layer_name: r.bgy_name,
        population: Number(r.population ?? 0),
        male: r.male === null ? null : Number(r.male),
        female: r.female === null ? null : Number(r.female) },
    }));
    let emptyMessage: string | undefined;
    if (features.length === 0) {
      const { rows: diagnostics } = await conn.query<{ visible: string; permitted: string }>(`
        SELECT COUNT(*) AS visible,
          COUNT(*) FILTER (WHERE ${scope.cond || "TRUE"}) AS permitted
        FROM core.brgy_bndry x
        WHERE x.geom && ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326), ST_SRID(x.geom))
      `, [...bbox, ...scope.params]);
      const counts = diagnostics[0];
      emptyMessage = Number(counts.visible) === 0
        ? "No barangay boundaries in this view. Pan to a land area in the Philippines."
        : Number(counts.permitted) === 0
          ? "This view is outside your assigned PSA scope. Pan to an area assigned to your account."
          : "Barangay boundaries were found, but their codes have no matching records in the 2020 census table.";
    }
    return NextResponse.json({ capped: rows.length > LIMIT, emptyMessage,
      map: { type: "FeatureCollection", features } },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Population query failed:", error);
    return NextResponse.json({ error: "Population query failed" }, { status: 500 });
  }
}
