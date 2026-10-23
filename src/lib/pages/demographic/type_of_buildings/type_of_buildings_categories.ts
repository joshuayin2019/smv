export const BUILDING_TYPE_CATEGORIES = [
  { field: 'building_type_single_house', label: 'Single house', color: '#b5bd00' },
  { field: 'building_type_duplex', label: 'Duplex', color: '#80cd89' },
  { field: 'building_type_apartment_accessoria_rowhouse', label: 'Apartment / accessoria / rowhouse', color: '#80deda' },
  { field: 'building_type_condominium_condotel', label: 'Condominium / condotel', color: '#00ce8a' },
  { field: 'building_type_other_multi_unit_residential', label: 'Other multi-unit residential', color: '#00ace2' },
  { field: 'building_type_commercial_industrial_agricultural', label: 'Commercial / industrial / agricultural', color: '#5789d5' },
  { field: 'building_type_institutional_living_quarter', label: 'Institutional living quarter', color: '#1758d5' },
  { field: 'building_type_other_types_of_building', label: 'Other', color: '#df00da' },
] as const;

export type BuildingTypeChart = {
  code: string;
  name: string;
  type_of_buildings: number;
  coordinates: [number, number];
  values: Record<string, number>;
};

// Pure SVG path generation, shared by the map renderer and tests.
export function pieSlicePath(start: number, fraction: number): string {
  const point = (angle: number) => `${20 + 18 * Math.cos(angle)} ${20 + 18 * Math.sin(angle)}`;
  if (fraction >= 1) return 'M 20 2 A 18 18 0 1 1 20 38 A 18 18 0 1 1 20 2 Z';
  const end = start + fraction * Math.PI * 2;
  return `M 20 20 L ${point(start)} A 18 18 0 ${fraction > 0.5 ? 1 : 0} 1 ${point(end)} Z`;
}
