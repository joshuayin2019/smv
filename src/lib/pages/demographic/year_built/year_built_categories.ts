export const YEAR_BUILT_CATEGORIES = [
  { field: 'year_built_2020', label: '2020', color: '#b5bd00' },
  { field: 'year_built_2019', label: '2019', color: '#80cd89' },
  { field: 'year_built_2018', label: '2018', color: '#80deda' },
  { field: 'year_built_2017', label: '2017', color: '#00ce8a' },
  { field: 'year_built_2016', label: '2016', color: '#00ace2' },
  { field: 'year_built_2011_to_2015', label: '2011–2015', color: '#5789d5' },
  { field: 'year_built_2001_to_2010', label: '2001–2010', color: '#1758d5' },
  { field: 'year_built_1980_or_earlier', label: '1980 or earlier', color: '#df00da' },
] as const;

export type YearBuiltChart = {
  code: string;
  name: string;
  year_built: number;
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
