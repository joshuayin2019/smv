// FILE: src/stores/map_stores.ts
import { create } from "zustand";
import type { Map as MapLibreMap } from "maplibre-gl";

type SmvState = {
    visible: boolean;
    opacity: number;
    enabled: Record<string, boolean>; // per-zonal toggles: { r, c, i, a }
};

// Only one boundary layer is shown at a time (radio buttons in the layer control)
export type BoundaryType = "region" | "province" | "municipality" | "barangay";
type BoundaryState = {
    visible: boolean; // master switch: off hides every boundary layer
    hoverable: boolean; // on: hovering a boundary highlights it and shows its name
    type: BoundaryType;
    opacity: number; // 0.1 .. 1
};

type MapState = {
    map: MapLibreMap | null; // set once the style has loaded, null when the map is removed
    setMap: (map: MapLibreMap | null) => void;

    // layer control
    smv: SmvState;
    boundary: BoundaryState;
    poiVisible: boolean;
    setSmv: (patch: Partial<SmvState>) => void;
    setBoundary: (patch: Partial<BoundaryState>) => void;
    toggleZonal: (key: string, on: boolean) => void;
    setPoiVisible: (visible: boolean) => void;
};

export const useMapStore = create<MapState>((set) => ({
    map: null,
    setMap: (map) => set({ map }),

    smv: { visible: true, opacity: 1, enabled: { r: true, c: true, i: true, a: true } },
    boundary: { visible: true, hoverable: false, type: "region", opacity: 1 }, // default: region, shown, hoverable
    poiVisible: true,
    setSmv: (patch) => set((s) => ({ smv: { ...s.smv, ...patch } })),
    setBoundary: (patch) => set((s) => ({ boundary: { ...s.boundary, ...patch } })),
    toggleZonal: (key, on) =>
        set((s) => ({ smv: { ...s.smv, enabled: { ...s.smv.enabled, [key]: on } } })),
    setPoiVisible: (visible) => set({ poiVisible: visible }),
}));