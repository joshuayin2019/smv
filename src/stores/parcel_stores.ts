import { create } from 'zustand';
import type { ParcelRow } from '@/lib/pages/parcel/parcel_types';

export const useParcelStore = create<{
  search: string; classification: string; selected: ParcelRow | null; revision: number;
  parcelTableQuery: string;
  setTableQuery: (query: string) => void;
  setFilters: (search: string, classification: string) => void;
  select: (row: ParcelRow | null) => void;
  refresh: () => void;
}>(set => ({
  search: '', classification: '', selected: null, revision: 0,
  parcelTableQuery: '',
  setTableQuery: parcelTableQuery => set({ parcelTableQuery }),
  setFilters: (search,classification) => set({ search,classification,selected: null }),
  select: selected => set({ selected }),
  refresh: () => set(s => ({ revision: s.revision + 1 })),
}));
