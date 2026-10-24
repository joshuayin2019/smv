import type { Scope } from '@/stores/global_stores';

export type DashboardScopes = { smv: Scope[]; poi: Scope[]; psa: Scope[] };
export type DashboardItem = { name: string; value: number; color?: string; categoryId?: string };
export type DashboardData = {
  generatedAt: string;
  market: { roads: number; averages: DashboardItem[]; years: DashboardItem[] } | null;
  poi: { total: number; categories: DashboardItem[]; areas: DashboardItem[] } | null;
  demographic: {
    population: number; male: number; female: number; barangays: number; municipalities: number;
    classes: DashboardItem[]; buildings: DashboardItem[]; years: DashboardItem[]; floors: DashboardItem[];
  } | null;
  errors: string[];
};

// Temporary illustrative parcel inventory. Never combined with live database totals.
export const SAMPLE_PARCELS: DashboardItem[] = [
  { name: 'Agricultural', value: 2800, color: '#22a06b' },
  { name: 'Residential', value: 6400, color: '#2458bd' },
  { name: 'Commercial', value: 1900, color: '#f59e0b' },
  { name: 'Industrial', value: 900, color: '#9a63da' },
];
