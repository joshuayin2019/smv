// src/stores/region_stores.ts
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
  setProvince: (province: Province[]) => void;
  clearProvince: () => void;
};

export const useProvinceStore = create<ProvinceState>((set) => ({
  province: [],
  setProvince: (province) => set({ province }),
  clearProvince: () => set({ province: [] }),
}));