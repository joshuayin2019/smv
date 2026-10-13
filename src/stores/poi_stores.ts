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
        // file name of the 360 panorama (equirectangular 2:1); null/undefined = no photosphere for this POI
        pano_filename?: string | null;
        reg_code: string | null;
        pro_code: string | null;
        mun_code: string | null;
        bgy_code: string | null;
    };
};

export type PoiProperties = PoiFeature["properties"];

export type PoiCollection = {
    type: "FeatureCollection";
    features: PoiFeature[];
};

export const emptyPoi: PoiCollection = { type: "FeatureCollection", features: [] };

// The POI clicked on the map (shown in the floating details window)
export type PoiSelection = { properties: PoiProperties; lng: number; lat: number };

// Radius filter inputs. "" = not filled in yet.
// km defaults to (and never goes below) MIN_RADIUS_KM, so picking a center is enough to start filtering.
export const MIN_RADIUS_KM = 1;
export type PoiRadius = { lat: number | ""; lng: number | ""; km: number | "" };
export const emptyRadius: PoiRadius = { lat: "", lng: "", km: MIN_RADIUS_KM };

type PoiState = {
    poi: PoiCollection;
    // rows currently visible in the table after search/filters (null = table has not reported yet)
    filteredPoi: PoiProperties[] | null;
    // radius filter (center + distance), shared by the table and the map
    radius: PoiRadius;
    // true while the next map click should set the radius center
    pickingCenter: boolean;
    // POI clicked on the map (null = details window closed)
    selectedPoi: PoiSelection | null;
    setSelectedPoi: (p: PoiSelection | null) => void;
    // true while the 360 photosphere is open (the map layer must not move the camera then)
    sphereActive: boolean;
    setSphereActive: (v: boolean) => void;
    setPoi: (poi: PoiCollection) => void;
    setFilteredPoi: (rows: PoiProperties[] | null) => void;
    setRadius: (r: Partial<PoiRadius>) => void;
    setPickingCenter: (v: boolean) => void;
    clearPoi: () => void;
};

export const usePoiStore = create<PoiState>((set) => ({
    poi: emptyPoi,
    filteredPoi: null,
    radius: emptyRadius,
    pickingCenter: false,
    selectedPoi: null,
    setSelectedPoi: (selectedPoi) => set({ selectedPoi }),
    sphereActive: false,
    setSphereActive: (sphereActive) => set({ sphereActive }),
    setPoi: (poi) => set({ poi, selectedPoi: null }),
    setFilteredPoi: (filteredPoi) => set({ filteredPoi }),
    setRadius: (r) => set((s) => ({ radius: { ...s.radius, ...r } })),
    setPickingCenter: (pickingCenter) => set({ pickingCenter }),
    clearPoi: () =>
        set({
            poi: emptyPoi,
            filteredPoi: null,
            radius: emptyRadius,
            pickingCenter: false,
            selectedPoi: null,
            sphereActive: false,
        }),
}));
