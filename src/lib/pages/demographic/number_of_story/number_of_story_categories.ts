export const BUILDING_STORY_CATEGORIES = [
  { field: 'floors_one_floor', label: '1 floor', color: '#b5bd00' },
  { field: 'floors_two_floors', label: '2 floors', color: '#80cd89' },
  { field: 'floors_three_floors', label: '3 floors', color: '#00ace2' },
  { field: 'floors_four_floors', label: '4 floors', color: '#1758d5' },
  { field: 'floors_five_to_10_floors', label: '5–10 floors', color: '#a748cb' },
  { field: 'floors_11_floors_or_more', label: '11 floors or more', color: '#df00da' },
] as const;

export type BuildingStoryChart = {
  code: string;
  name: string;
  number_of_story: number;
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
