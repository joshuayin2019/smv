import { create } from "zustand";

export interface Scope {
  scope_level: number;
  code: string | null;
}

export interface Auth {
  user_id: number;
  username: string;
  fullname: string;
  role: string;
  scope_poi: Scope[];
  scope_zonalvalue: Scope[];
  scope_psa: Scope[];
}

interface GlobalState {
  auth: Auth | null;
  setAuth: (auth: Auth | null) => void;
  clearAuth: () => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  auth: null,
  setAuth: (auth) => set({ auth }),
  clearAuth: () => set({ auth: null }),
}));