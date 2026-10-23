// Only the supplied categories are included; this is not an all-types total.
export const BUILDING_TYPE_FIELDS = ["building_type_single_house","building_type_duplex","building_type_apartment_accessoria_rowhouse","building_type_condominium_condotel","building_type_other_multi_unit_residential","building_type_commercial_industrial_agricultural","building_type_institutional_living_quarter","building_type_other_types_of_building"] as const;
export const BUILDING_TYPE_TOTAL_SQL = `(COALESCE(p.building_type_single_house, 0)::bigint + COALESCE(p.building_type_duplex, 0)::bigint + COALESCE(p.building_type_apartment_accessoria_rowhouse, 0)::bigint + COALESCE(p.building_type_condominium_condotel, 0)::bigint + COALESCE(p.building_type_other_multi_unit_residential, 0)::bigint + COALESCE(p.building_type_commercial_industrial_agricultural, 0)::bigint + COALESCE(p.building_type_institutional_living_quarter, 0)::bigint + COALESCE(p.building_type_other_types_of_building, 0)::bigint)`;
// Reuse municipality geometry while calculating counts from the barangay source.
export const BUILDING_TYPE_MUNICIPAL_SQL = `(
 SELECT m.reg_code, m.reg_name, m.pro_code, m.pro_name, m.mun_code, m.mun_name, m.geom, m.lbl, c.type_of_buildings
 FROM data.psa_2020_municipalities m
 JOIN (SELECT b.mun_code, SUM((COALESCE(p.building_type_single_house, 0)::bigint + COALESCE(p.building_type_duplex, 0)::bigint + COALESCE(p.building_type_apartment_accessoria_rowhouse, 0)::bigint + COALESCE(p.building_type_condominium_condotel, 0)::bigint + COALESCE(p.building_type_other_multi_unit_residential, 0)::bigint + COALESCE(p.building_type_commercial_industrial_agricultural, 0)::bigint + COALESCE(p.building_type_institutional_living_quarter, 0)::bigint + COALESCE(p.building_type_other_types_of_building, 0)::bigint))::bigint AS type_of_buildings
       FROM core.brgy_bndry b JOIN data.psa_2020 p ON p.bar_code = b.bgy_code GROUP BY b.mun_code) c ON c.mun_code = m.mun_code
)`;
