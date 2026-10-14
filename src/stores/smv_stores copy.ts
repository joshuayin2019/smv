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
};

// Stable empty array so deferred / memo comparisons don't churn
export const emptySmv: SmvRecord[] = [];

type SmvStore = {
  smv: SmvRecord[];
  loading: boolean;
  filteredSmv: SmvRecord[] | null; // rows currently visible after table filters (null = no table mounted)
  selectedSmv: SmvRecord | null;

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

  setSmv: (smv) => set({ smv }),
  setLoading: (loading) => set({ loading }),
  setFilteredSmv: (filteredSmv) => set({ filteredSmv }),
  setSelectedSmv: (selectedSmv) => set({ selectedSmv }),
  clear: () => set({ smv: emptySmv, loading: false, filteredSmv: null, selectedSmv: null }),
}));