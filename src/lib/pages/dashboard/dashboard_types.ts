import type { Scope } from '@/stores/global_stores';

export type DashboardScopes = { smv: Scope[]; poi: Scope[]; psa: Scope[]; parcel: Scope[] };
export type DashboardItem = { name: string; value: number; color?: string; categoryId?: string };
export type DashboardData = {
  generatedAt: string;
  market: { roads: number; averages: DashboardItem[]; years: DashboardItem[] } | null;
  poi: { total: number; categories: DashboardItem[]; areas: DashboardItem[] } | null;
  parcel: { total: number; synthetic: number; classifications: DashboardItem[] } | null;
  demographic: {
    population: number; male: number; female: number; barangays: number; municipalities: number;
    classes: DashboardItem[]; buildings: DashboardItem[]; years: DashboardItem[]; floors: DashboardItem[];
  } | null;
  errors: string[];
};
