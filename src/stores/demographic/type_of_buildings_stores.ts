import { create } from "zustand";

export type BuildingTypeMode = "region" | "province" | "municipality" | "barangay";

export type BuildingTypeRecord = {
  level?: BuildingTypeMode;
  code: string;
  name?: string;
  type_of_buildings?: number;
};

type BuildingTypeState = {
  boundaryHoverEnabled: boolean;
  setBoundaryHoverEnabled: (enabled: boolean) => void;
  chartStatus: string;
  setChartStatus: (status: string) => void;
  type_of_buildingsMode: BuildingTypeMode;
  setBuildingTypeMode: (m: BuildingTypeMode) => void;

  selectedBuildingType: BuildingTypeRecord | null;
  setSelectedBuildingType: (p: BuildingTypeRecord | null) => void;

  // querystring the table is using (level + search + filters + scope, no paging); read by the summary
  type_of_buildingsTableQuery: string | null;
  setBuildingTypeTableQuery: (q: string | null) => void;
};

export const useBuildingTypeStore = create<BuildingTypeState>((set) => ({
  boundaryHoverEnabled: true,
  setBoundaryHoverEnabled: (boundaryHoverEnabled) => set({ boundaryHoverEnabled }),
  chartStatus: '',
  setChartStatus: (chartStatus) => set({ chartStatus }),
  type_of_buildingsMode: "municipality",
  setBuildingTypeMode: (type_of_buildingsMode) => set({ type_of_buildingsMode }),

  selectedBuildingType: null,
  setSelectedBuildingType: (selectedBuildingType) => set({ selectedBuildingType }),

  type_of_buildingsTableQuery: null,
  setBuildingTypeTableQuery: (type_of_buildingsTableQuery) => set({ type_of_buildingsTableQuery }),
}));
