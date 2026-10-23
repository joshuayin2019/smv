export const POPULATION_CATEGORIES = [
  { field: 'sex_male', label: 'Male', color: '#0784ff' },
  { field: 'sex_female', label: 'Female', color: '#ff9800' },
] as const;

export type PopulationChart = {
  code: string;
  name: string;
  population: number;
  coordinates: [number, number];
  values: Record<string, number>;
};

// Fixed SVG markup; the only interpolated values are sanitized numeric arc lengths.
export function populationSexSvg(male: unknown, female: unknown): string {
  const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const m = count(male), f = count(female);
  const total = m + f;
  const circumference = 2 * Math.PI * 40;
  const fraction = total > 0 && Number.isFinite(total) ? m / total : 0;
  return `<circle cx="50" cy="50" r="48" fill="white"/>
    <circle cx="50" cy="50" r="40" fill="#f8fafc" stroke="${total > 0 ? '#ff9800' : '#cbd5e1'}" stroke-width="12"/>
    ${fraction > 0 ? `<circle cx="50" cy="50" r="40" fill="none" stroke="#0784ff" stroke-width="12" stroke-dasharray="${fraction * circumference} ${circumference}" transform="rotate(-90 50 50)"/>` : ''}
    <g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <g stroke="#0784ff"><circle cx="40" cy="42" r="6"/><path d="M28 65V61C28 55 33 52 40 52C47 52 52 55 52 61V65"/></g>
      <g stroke="#ff9800"><circle cx="61" cy="43" r="5"/><path d="M59 54C67 53 73 57 73 63V65"/></g>
    </g>`;
}
