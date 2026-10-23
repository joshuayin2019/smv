// Counts buildings, not floors: each supplied category contributes its building count.
export const BUILDING_STORY_FIELDS = ["floors_one_floor","floors_two_floors","floors_three_floors","floors_four_floors","floors_five_to_10_floors","floors_11_floors_or_more"] as const;
export const BUILDING_STORY_TOTAL_SQL = `(COALESCE(p.floors_one_floor, 0)::bigint + COALESCE(p.floors_two_floors, 0)::bigint + COALESCE(p.floors_three_floors, 0)::bigint + COALESCE(p.floors_four_floors, 0)::bigint + COALESCE(p.floors_five_to_10_floors, 0)::bigint + COALESCE(p.floors_11_floors_or_more, 0)::bigint)`;
export const BUILDING_STORY_MUNICIPAL_SQL = `(
 SELECT m.reg_code, m.reg_name, m.pro_code, m.pro_name, m.mun_code, m.mun_name, m.geom, m.lbl, c.number_of_story
 FROM data.psa_2020_municipalities m
 JOIN (SELECT b.mun_code, SUM((COALESCE(p.floors_one_floor, 0)::bigint + COALESCE(p.floors_two_floors, 0)::bigint + COALESCE(p.floors_three_floors, 0)::bigint + COALESCE(p.floors_four_floors, 0)::bigint + COALESCE(p.floors_five_to_10_floors, 0)::bigint + COALESCE(p.floors_11_floors_or_more, 0)::bigint))::bigint AS number_of_story
 FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
 GROUP BY b.mun_code) c ON c.mun_code = m.mun_code
)`;
