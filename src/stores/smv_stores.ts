// FILE: src/stores/smv_stores.ts  (replace your store; this is the new version, unchanged from the one you pasted)
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
// m is in METERS. An empty or too small value falls back to DEFAULT_RADIUS_M, so picking a
// center on the map is enough to start filtering (and the circle is big enough to see).
export const MIN_RADIUS_M = 5;
export const DEFAULT_RADIUS_M = 500;
export type SmvRadius = { lat: number | ""; lng: number | ""; m: number | "" };
export const emptyRadius: SmvRadius = { lat: "", lng: "", m: DEFAULT_RADIUS_M };

// The radius in meters that is actually applied: what was typed, or the default
export const effectiveRadiusM = (m: number | "") =>
  typeof m === "number" && m >= MIN_RADIUS_M ? m : DEFAULT_RADIUS_M;

// Stable empty array so deferred / memo comparisons don't churn
export const emptySmv: SmvRecord[] = [];

type SmvStore = {
  smv: SmvRecord[];
  loading: boolean;
  filteredSmv: SmvRecord[] | null; // rows currently visible after table filters (null = no table mounted)
  // Server-side table: the querystring the table currently shows (search + filters + sort + radius + scope,
  // without paging) and how many rows it matches. Shared with other panels that ask the server for their own data.
  smvTableQuery: string | null;
  smvTotal: number;
  selectedSmv: SmvRecord | null;
  radius: SmvRadius; // radius filter (center + distance), shared by the table and the map
  pickingCenter: boolean; // true while the next map click should set the radius center

  setRadius: (r: Partial<SmvRadius>) => void;
  setPickingCenter: (v: boolean) => void;
  setSmv: (rows: SmvRecord[]) => void;
  setLoading: (v: boolean) => void;
  setFilteredSmv: (rows: SmvRecord[] | null) => void;
  setSmvTableQuery: (query: string | null, total: number) => void;
  setSelectedSmv: (row: SmvRecord | null) => void;
  clear: () => void;
};

export const useSmvStore = create<SmvStore>((set) => ({
  smv: emptySmv,
  loading: false,
  filteredSmv: null,
  smvTableQuery: null,
  smvTotal: 0,
  selectedSmv: null,
  radius: emptyRadius,
  pickingCenter: false,

  setRadius: (r) => set((st) => ({ radius: { ...st.radius, ...r } })),
  setPickingCenter: (pickingCenter) => set({ pickingCenter }),
  setSmv: (smv) => set({ smv }),
  setLoading: (loading) => set({ loading }),
  setFilteredSmv: (filteredSmv) => set({ filteredSmv }),
  setSmvTableQuery: (smvTableQuery, smvTotal) => set({ smvTableQuery, smvTotal }),
  setSelectedSmv: (selectedSmv) => set({ selectedSmv }),
  clear: () =>
    set({
      smv: emptySmv,
      loading: false,
      filteredSmv: null,
      smvTableQuery: null,
      smvTotal: 0,
      selectedSmv: null,
      radius: emptyRadius,
      pickingCenter: false,
    }),
}));
