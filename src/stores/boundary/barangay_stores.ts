// FILE: src/stores/boundary/barangay_stores.ts
import { create } from "zustand";

export type Barangay = {
  id: number;
  reg_code: string;
  reg_name: string;
  pro_code: string;
  pro_name: string;
  mun_code: string;
  mun_name: string;
  bgy_code: string;
  bgy_name: string;
};

type BarangayState = {
  selectedId: number | null;
  zoomRequest: { id: number; n: number } | null; // the layer watches this and zooms the map
  setSelectedId: (id: number | null) => void;
  selectAndZoom: (id: number) => void; // select + ask the map layer to zoom to the barangay
};

export const useBarangayStore = create<BarangayState>((set) => ({
  selectedId: null,
  zoomRequest: null,
  setSelectedId: (selectedId) => set({ selectedId }),
  // a new object every time, so clicking the same barangay again still triggers a zoom
  selectAndZoom: (id) =>
    set((st) => ({ selectedId: id, zoomRequest: { id, n: (st.zoomRequest?.n ?? 0) + 1 } })),
}));