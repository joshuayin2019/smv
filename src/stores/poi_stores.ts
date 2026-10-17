// src/stores/poi_stores.ts
import { create } from "zustand";
import type { Place, RouteResult } from "@/lib/openroute";

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
export const MIN_RADIUS_M  = 5;
export type PoiRadius = { lat: number | ""; lng: number | ""; m: number | "" };
export const emptyRadius: PoiRadius = { lat: "", lng: "", m: MIN_RADIUS_M };

// ----- Table query shared with the summary chart ----------------------------
// What the table filters by (no sort / paging: they don't change the aggregates).
// `radius.km` is the distance in kilometres, already resolved (center set, km >= minimum).
export type PoiFilterKey = "category" | "region" | "province" | "city_municipality" | "barangay";
export type PoiTableQueryPayload = {
    search: string;
    filters: Record<PoiFilterKey, string[]>;
    radius: { lat: number; lng: number; km: number } | null;
};

export const emptyPoiTableQuery: PoiTableQueryPayload = {
    search: "",
    filters: { category: [], region: [], province: [], city_municipality: [], barangay: [] },
    radius: null,
};

// Stable string, so consumers only react when the query really changes
export const serializePoiTableQuery = (q: PoiTableQueryPayload) => JSON.stringify(q);

export const parsePoiTableQuery = (s: string | null): PoiTableQueryPayload => {
    if (!s) return emptyPoiTableQuery;
    try {
        const p = JSON.parse(s) as Partial<PoiTableQueryPayload>;
        return {
            search: p.search ?? "",
            filters: { ...emptyPoiTableQuery.filters, ...(p.filters ?? {}) },
            radius: p.radius ?? null,
        };
    } catch {
        return emptyPoiTableQuery;
    }
};

type PoiState = {
    poi: PoiCollection;
    // rows currently visible in the table after search/filters (null = table has not reported yet)
    filteredPoi: PoiProperties[] | null;
    // query the table currently shows (JSON of PoiTableQueryPayload; see serializePoiTableQuery)
    // and how many rows it matches. Shared with the summary chart, which asks the server for its own aggregates.
    poiTableQuery: string | null;
    poiTotal: number;
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
    setPoiTableQuery: (query: string | null, total: number) => void;
    setRadius: (r: Partial<PoiRadius>) => void;
    // turning this on turns pickingFrom off (both use the next map click)
    setPickingCenter: (v: boolean) => void;
    clearPoi: () => void;

    // ----- Directions (OpenRouteService) -----------------------------------
    // start / end of the current route search (drawn as markers on the map)
    routeFrom: Place | null;
    routeTo: Place | null;
    // routes returned by the API and the one currently highlighted
    routes: RouteResult[];
    selectedRoute: number;
    // true while the next map click should become the route start point
    pickingFrom: boolean;
    // the point picked on the map (always a NEW object so the Directions panel reacts every time)
    pickedPoint: Place | null;
    setRouteFrom: (p: Place | null) => void;
    setRouteTo: (p: Place | null) => void;
    setRoutes: (routes: RouteResult[], selected: number) => void;
    // turning this on turns pickingCenter off (both use the next map click)
    setPickingFrom: (v: boolean) => void;
    setPickedPoint: (p: Place | null) => void;
    resetRoute: () => void;
};

const emptyRoute = {
    routeFrom: null,
    routeTo: null,
    routes: [] as RouteResult[],
    selectedRoute: 0,
    pickingFrom: false,
    pickedPoint: null,
};

export const usePoiStore = create<PoiState>((set) => ({
    poi: emptyPoi,
    filteredPoi: null,
    poiTableQuery: null,
    poiTotal: 0,
    radius: emptyRadius,
    pickingCenter: false,
    selectedPoi: null,
    setSelectedPoi: (selectedPoi) => set({ selectedPoi }),
    sphereActive: false,
    setSphereActive: (sphereActive) => set({ sphereActive }),
    setPoi: (poi) => set({ poi, selectedPoi: null }),
    setFilteredPoi: (filteredPoi) => set({ filteredPoi }),
    setPoiTableQuery: (poiTableQuery, poiTotal) => set({ poiTableQuery, poiTotal }),
    setRadius: (r) => set((s) => ({ radius: { ...s.radius, ...r } })),
    setPickingCenter: (pickingCenter) =>
        set(pickingCenter ? { pickingCenter: true, pickingFrom: false } : { pickingCenter: false }),
    clearPoi: () =>
        set({
            poi: emptyPoi,
            filteredPoi: null,
            poiTableQuery: null,
            poiTotal: 0,
            radius: emptyRadius,
            pickingCenter: false,
            selectedPoi: null,
            sphereActive: false,
            ...emptyRoute,
        }),

    ...emptyRoute,
    setRouteFrom: (routeFrom) => set({ routeFrom }),
    setRouteTo: (routeTo) => set({ routeTo }),
    setRoutes: (routes, selectedRoute) => set({ routes, selectedRoute }),
    setPickingFrom: (pickingFrom) =>
        set(pickingFrom ? { pickingFrom: true, pickingCenter: false } : { pickingFrom: false }),
    setPickedPoint: (pickedPoint) => set({ pickedPoint }),
    resetRoute: () => set({ ...emptyRoute }),
}));