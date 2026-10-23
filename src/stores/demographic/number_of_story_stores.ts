import { create } from "zustand";

export type BuildingStoryMode = "region" | "province" | "municipality" | "barangay";

export type BuildingStoryRecord = {
  level?: BuildingStoryMode;
  code: string;
  name?: string;
  number_of_story?: number;
};

type BuildingStoryState = {
  boundaryHoverEnabled: boolean;
  setBoundaryHoverEnabled: (enabled: boolean) => void;
  chartStatus: string;
  setChartStatus: (status: string) => void;
  number_of_storyMode: BuildingStoryMode;
  setBuildingStoryMode: (m: BuildingStoryMode) => void;

  selectedBuildingStory: BuildingStoryRecord | null;
  setSelectedBuildingStory: (p: BuildingStoryRecord | null) => void;

  // querystring the table is using (level + search + filters + scope, no paging); read by the summary
  number_of_storyTableQuery: string | null;
  setBuildingStoryTableQuery: (q: string | null) => void;
};

export const useBuildingStoryStore = create<BuildingStoryState>((set) => ({
  boundaryHoverEnabled: true,
  setBoundaryHoverEnabled: (boundaryHoverEnabled) => set({ boundaryHoverEnabled }),
  chartStatus: '',
  setChartStatus: (chartStatus) => set({ chartStatus }),
  number_of_storyMode: "municipality",
  setBuildingStoryMode: (number_of_storyMode) => set({ number_of_storyMode }),

  selectedBuildingStory: null,
  setSelectedBuildingStory: (selectedBuildingStory) => set({ selectedBuildingStory }),

  number_of_storyTableQuery: null,
  setBuildingStoryTableQuery: (number_of_storyTableQuery) => set({ number_of_storyTableQuery }),
}));
