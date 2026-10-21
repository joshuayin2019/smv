// src/stores/boundary/province_stores.ts
import { create } from "zustand";

export type Province = {
  id: number;
  reg_code: string;
  reg_name: string;
  pro_code: string;
  pro_name: string;
};

type ProvinceState = {
  province: Province[];
  selectedId: number | null;
  zoomRequest: { id: number; n: number } | null; // the layer watches this and zooms the map
  setProvince: (province: Province[]) => void;
  setSelectedId: (id: number | null) => void;
  selectAndZoom: (id: number) => void; // select + ask the map layer to zoom to the province
  clearProvince: () => void;
};

export const useProvinceStore = create<ProvinceState>((set) => ({
  province: [],
  selectedId: null,
  zoomRequest: null,
  setProvince: (province) => set({ province }),
  setSelectedId: (selectedId) => set({ selectedId }),
  // a new object every time, so clicking the same province again still triggers a zoom
  selectAndZoom: (id) =>
    set((st) => ({ selectedId: id, zoomRequest: { id, n: (st.zoomRequest?.n ?? 0) + 1 } })),
  clearProvince: () => set({ province: [], selectedId: null }), // keep zoomRequest: its counter must keep growing
}));