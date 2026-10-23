// Only the supplied categories are included; this is not an all-years total.
export const YEAR_BUILT_FIELDS = ["year_built_2020","year_built_2019","year_built_2018","year_built_2017","year_built_2016","year_built_2011_to_2015","year_built_2001_to_2010","year_built_1980_or_earlier"] as const;
export const YEAR_BUILT_TOTAL_SQL = `(COALESCE(p.year_built_2020, 0)::bigint + COALESCE(p.year_built_2019, 0)::bigint + COALESCE(p.year_built_2018, 0)::bigint + COALESCE(p.year_built_2017, 0)::bigint + COALESCE(p.year_built_2016, 0)::bigint + COALESCE(p.year_built_2011_to_2015, 0)::bigint + COALESCE(p.year_built_2001_to_2010, 0)::bigint + COALESCE(p.year_built_1980_or_earlier, 0)::bigint)`;
// Reuse municipality geometry while calculating counts from the barangay source.
export const YEAR_BUILT_MUNICIPAL_SQL = `(
 SELECT m.reg_code, m.reg_name, m.pro_code, m.pro_name, m.mun_code, m.mun_name, m.geom, m.lbl, c.year_built
 FROM data.psa_2020_municipalities m
 JOIN (SELECT b.mun_code, SUM((COALESCE(p.year_built_2020, 0)::bigint + COALESCE(p.year_built_2019, 0)::bigint + COALESCE(p.year_built_2018, 0)::bigint + COALESCE(p.year_built_2017, 0)::bigint + COALESCE(p.year_built_2016, 0)::bigint + COALESCE(p.year_built_2011_to_2015, 0)::bigint + COALESCE(p.year_built_2001_to_2010, 0)::bigint + COALESCE(p.year_built_1980_or_earlier, 0)::bigint))::bigint AS year_built
       FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code GROUP BY b.mun_code) c ON c.mun_code = m.mun_code
)`;
