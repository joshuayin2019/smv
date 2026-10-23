export const POPULATION_FIELDS = ['sex_male', 'sex_female'] as const;
export const POPULATION_TOTAL_SQL = 'COALESCE(p.population, 0)::bigint';

// Preserve Population's existing municipality totals; add sex counts from barangay records.
export const populationMunicipalitySexSql = (scopeSql: string) => `(
  SELECT m.reg_code, m.reg_name, m.pro_code, m.pro_name, m.mun_code, m.mun_name,
         m.population, COALESCE(s.sex_male, 0)::bigint AS sex_male,
         COALESCE(s.sex_female, 0)::bigint AS sex_female
  FROM data.psa_2020_municipalities m
  LEFT JOIN (
    SELECT b.mun_code, SUM(COALESCE(p.sex_male, 0)::bigint)::bigint AS sex_male,
           SUM(COALESCE(p.sex_female, 0)::bigint)::bigint AS sex_female
    FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code
    WHERE TRUE${scopeSql} GROUP BY b.mun_code
  ) s ON s.mun_code = m.mun_code
)`;
