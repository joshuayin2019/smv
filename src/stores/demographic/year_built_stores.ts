import { create } from "zustand";

export type YearBuiltMode = "region" | "province" | "municipality" | "barangay";

export type YearBuiltRecord = {
  level?: YearBuiltMode;
  code: string;
  name?: string;
  year_built?: number;
};

type YearBuiltState = {
  year_builtMode: YearBuiltMode;
  setYearBuiltMode: (m: YearBuiltMode) => void;

  selectedYearBuilt: YearBuiltRecord | null;
  setSelectedYearBuilt: (p: YearBuiltRecord | null) => void;

  // querystring the table is using (level + search + filters + scope, no paging); read by the summary
  year_builtTableQuery: string | null;
  setYearBuiltTableQuery: (q: string | null) => void;
};

export const useYearBuiltStore = create<YearBuiltState>((set) => ({
  year_builtMode: "municipality",
  setYearBuiltMode: (year_builtMode) => set({ year_builtMode }),

  selectedYearBuilt: null,
  setSelectedYearBuilt: (selectedYearBuilt) => set({ selectedYearBuilt }),

  year_builtTableQuery: null,
  setYearBuiltTableQuery: (year_builtTableQuery) => set({ year_builtTableQuery }),
}));