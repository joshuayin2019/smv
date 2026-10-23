import { create } from "zustand";

export type PopulationMode = "region" | "province" | "municipality" | "barangay";

export type PopulationRecord = {
  level?: PopulationMode;
  code: string;
  name?: string;
  population?: number;
};

type PopulationState = {
  boundaryHoverEnabled: boolean;
  setBoundaryHoverEnabled: (enabled: boolean) => void;
  chartStatus: string;
  setChartStatus: (status: string) => void;
  populationMode: PopulationMode;
  setPopulationMode: (m: PopulationMode) => void;

  selectedPopulation: PopulationRecord | null;
  setSelectedPopulation: (p: PopulationRecord | null) => void;

  // querystring the table is using (level + search + filters + scope, no paging); read by the summary
  populationTableQuery: string | null;
  setPopulationTableQuery: (q: string | null) => void;
};

export const usePopulationStore = create<PopulationState>((set) => ({
  boundaryHoverEnabled: true,
  setBoundaryHoverEnabled: (boundaryHoverEnabled) => set({ boundaryHoverEnabled }),
  chartStatus: '',
  setChartStatus: (chartStatus) => set({ chartStatus }),
  populationMode: "municipality",
  setPopulationMode: (populationMode) => set({ populationMode }),

  selectedPopulation: null,
  setSelectedPopulation: (selectedPopulation) => set({ selectedPopulation }),

  populationTableQuery: null,
  setPopulationTableQuery: (populationTableQuery) => set({ populationTableQuery }),
}));
