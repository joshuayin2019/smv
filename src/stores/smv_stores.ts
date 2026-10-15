import { create } from "zustand";

export type SmvRecord = {
  id: string | number;
  street: string | null;
  bgy_name: string | null;
  reg_name?: string | null; // region (add this column to the loadsmv response)
  mun_name: string | null;
  pro_name: string | null;
  fclass: string | null;
  smv_year: number | string | null;
  r: number | string | null; // residential
  c: number | string | null; // commercial
  i: number | string | null; // industrial
  a: number | string | null; // agricultural
  bbox?: number[];
};

// Radius filter inputs. "" = not filled in yet.
// m (meters) defaults to (and never goes below) MIN_RADIUS_M, so picking a center is enough to start filtering.
export const MIN_RADIUS_M = 5;
export type SmvRadius = { lat: number | ""; lng: number | ""; m: number | "" };
export const emptyRadius: SmvRadius = { lat: "", lng: "", m: MIN_RADIUS_M };

// Stable empty array so deferred / memo comparisons don't churn
export const emptySmv: SmvRecord[] = [];

type SmvStore = {
  smv: SmvRecord[];
  loading: boolean;
  filteredSmv: SmvRecord[] | null; // rows currently visible after table filters (null = no table mounted)
  selectedSmv: SmvRecord | null;
  radius: SmvRadius; // radius filter (center + distance), shared by the table and the map
  pickingCenter: boolean; // true while the next map click should set the radius center

  setRadius: (r: Partial<SmvRadius>) => void;
  setPickingCenter: (v: boolean) => void;
  setSmv: (rows: SmvRecord[]) => void;
  setLoading: (v: boolean) => void;
  setFilteredSmv: (rows: SmvRecord[] | null) => void;
  setSelectedSmv: (row: SmvRecord | null) => void;
  clear: () => void;
};

export const useSmvStore = create<SmvStore>((set) => ({
  smv: emptySmv,
  loading: false,
  filteredSmv: null,
  selectedSmv: null,
  radius: emptyRadius,
  pickingCenter: false,

  setRadius: (r) => set((st) => ({ radius: { ...st.radius, ...r } })),
  setPickingCenter: (pickingCenter) => set({ pickingCenter }),
  setSmv: (smv) => set({ smv }),
  setLoading: (loading) => set({ loading }),
  setFilteredSmv: (filteredSmv) => set({ filteredSmv }),
  setSelectedSmv: (selectedSmv) => set({ selectedSmv }),
  clear: () =>
    set({
      smv: emptySmv,
      loading: false,
      filteredSmv: null,
      selectedSmv: null,
      radius: emptyRadius,
      pickingCenter: false,
    }),
}));
