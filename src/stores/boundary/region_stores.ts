// src/stores/boundary/region_stores.ts
import { create } from "zustand";

export type Region = {
  id: number;
  reg_code: string;
  reg_name: string;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] in EPSG:4326
};

type RegionState = {
  regions: Region[];
  selectedId: number | null;
  zoomRequest: { id: number; n: number } | null; // the layer watches this and zooms the map
  setRegions: (regions: Region[]) => void;
  setSelectedId: (id: number | null) => void;
  selectAndZoom: (id: number) => void; // select + ask the map layer to zoom to the region
  clearRegion: () => void;
};

export const useRegionStore = create<RegionState>((set) => ({
  regions: [],
  selectedId: null,
  zoomRequest: null,
  setRegions: (regions) => set({ regions }),
  setSelectedId: (selectedId) => set({ selectedId }),
  // a new object every time, so clicking the same region again still triggers a zoom
  selectAndZoom: (id) =>
    set((st) => ({ selectedId: id, zoomRequest: { id, n: (st.zoomRequest?.n ?? 0) + 1 } })),
  clearRegion: () => set({ regions: [], selectedId: null }), // keep zoomRequest: its counter must keep growing
}));