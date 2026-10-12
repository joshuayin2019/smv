// src/stores/map_stores.ts
import { create } from "zustand";
import type { Map as MapLibreMap } from "maplibre-gl";

type MapState = {
    map: MapLibreMap | null; // set once the style has loaded, null when the map is removed
    setMap: (map: MapLibreMap | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
    map: null,
    setMap: (map) => set({ map }),
}));