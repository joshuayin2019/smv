import { create } from "zustand";

export type BarangayClassMode = "barangay";

export type BarangayClassRecord = {
  level?: BarangayClassMode;
  code: string;
  name?: string;
  urban_rural?: string;
};

type BarangayClassState = {
  boundaryHoverEnabled: boolean;
  setBoundaryHoverEnabled: (enabled: boolean) => void;
  chartStatus: string;
  setChartStatus: (status: string) => void;
  barangay_classMode: BarangayClassMode;
  setBarangayClassMode: (m: BarangayClassMode) => void;

  selectedBarangayClass: BarangayClassRecord | null;
  setSelectedBarangayClass: (p: BarangayClassRecord | null) => void;

  // querystring the table is using (level + search + filters + scope, no paging); read by the summary
  barangay_classTableQuery: string | null;
  setBarangayClassTableQuery: (q: string | null) => void;
};

export const useBarangayClassStore = create<BarangayClassState>((set) => ({
  boundaryHoverEnabled: true,
  setBoundaryHoverEnabled: (boundaryHoverEnabled) => set({ boundaryHoverEnabled }),
  chartStatus: '',
  setChartStatus: (chartStatus) => set({ chartStatus }),
  barangay_classMode: "barangay",
  setBarangayClassMode: (barangay_classMode) => set({ barangay_classMode }),

  selectedBarangayClass: null,
  setSelectedBarangayClass: (selectedBarangayClass) => set({ selectedBarangayClass }),

  barangay_classTableQuery: null,
  setBarangayClassTableQuery: (barangay_classTableQuery) => set({ barangay_classTableQuery }),
}));
