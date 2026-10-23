import { create } from "zustand";

export type PopulationMode = "region" | "province" | "municipality" | "barangay";

export type PopulationRecord = {
  level?: PopulationMode;
  code: string;
  name?: string;
  population?: number;
};

type PopulationState = {
  populationMode: PopulationMode;
  setPopulationMode: (m: PopulationMode) => void;

  selectedPopulation: PopulationRecord | null;
  setSelectedPopulation: (p: PopulationRecord | null) => void;
};

export const usePopulationStore = create<PopulationState>((set) => ({
  populationMode: "barangay",
  setPopulationMode: (populationMode) => set({ populationMode }),

  selectedPopulation: null,
  setSelectedPopulation: (selectedPopulation) => set({ selectedPopulation }),
}));