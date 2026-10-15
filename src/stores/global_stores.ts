import { create } from "zustand";

export interface Scope {
  scope_level: number;
  code: string | null;
}

export interface Auth {
  user_id: number;
  username: string;
  fullname: string;
  email: string; 
  role: string;
  scope_poi: Scope[];
  scope_smv: Scope[];
  scope_psa: Scope[];
}

export const DEFAULT_PAGE = "Dashboard";


interface GlobalState {
  auth: Auth | null;
  setAuth: (auth: Auth | null) => void;
  clearAuth: () => void;

  activePage: string;
  setActivePage: (page: string) => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  auth: null,
  setAuth: (auth) => set({ auth }),
  clearAuth: () => set({ auth: null }),

  activePage: DEFAULT_PAGE,
  setActivePage: (activePage) => set({ activePage }),
}));