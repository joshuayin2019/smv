import { create } from "zustand";
import type { Map as MapLibreMap } from "maplibre-gl";

type SmvState = {
    visible: boolean;
    opacity: number;
    enabled: Record<string, boolean>; // per-zonal toggles: { r, c, i, a }
};

type MapState = {
    map: MapLibreMap | null; // set once the style has loaded, null when the map is removed
    setMap: (map: MapLibreMap | null) => void;

    // layer control
    smv: SmvState;
    poiVisible: boolean;
    setSmv: (patch: Partial<SmvState>) => void;
    toggleZonal: (key: string, on: boolean) => void;
    setPoiVisible: (visible: boolean) => void;
};

export const useMapStore = create<MapState>((set) => ({
    map: null,
    setMap: (map) => set({ map }),

    smv: { visible: true, opacity: 1, enabled: { r: true, c: true, i: true, a: true } },
    poiVisible: true,
    setSmv: (patch) => set((s) => ({ smv: { ...s.smv, ...patch } })),
    toggleZonal: (key, on) =>
        set((s) => ({ smv: { ...s.smv, enabled: { ...s.smv.enabled, [key]: on } } })),
    setPoiVisible: (visible) => set({ poiVisible: visible }),
}));