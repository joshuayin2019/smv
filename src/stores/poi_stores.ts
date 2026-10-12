// src/stores/poi_stores.ts
import { create } from "zustand";

export type PoiFeature = {
    type: "Feature";
    id: number | string;
    geometry: { type: string; coordinates: unknown };
    properties: {
        fid: number;
        id: number;
        name: string;
        category: string;
        category_id: number;
        ft_traffic: number | null;
        rd_name: string | null;
        as_of: string | null;
        barangay: string | null;
        district: string;
        city_municipality: string | null;
        province: string | null;
        region: string | null;
        filename: string | null;
        reg_code: string | null;
        pro_code: string | null;
        mun_code: string | null;
        bgy_code: string | null;
    };
};

export type PoiCollection = {
    type: "FeatureCollection";
    features: PoiFeature[];
};

export const emptyPoi: PoiCollection = { type: "FeatureCollection", features: [] };

type PoiState = {
    poi: PoiCollection;
    setPoi: (poi: PoiCollection) => void;
    clearPoi: () => void;
};

export const usePoiStore = create<PoiState>((set) => ({
    poi: emptyPoi,
    setPoi: (poi) => set({ poi }),
    clearPoi: () => set({ poi: emptyPoi }),
}));