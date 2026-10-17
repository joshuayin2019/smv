import { useGlobalStore } from "./global_stores";
import { useMapStore } from "./map_stores";
//import { usePoiStore } from "./poi_stores";
//import { useSmvStore } from "./smv_stores";

/* Puts every zustand store back to its initial state (fresh start). */
export function resetAllStores() {
  //usePoiStore.setState(usePoiStore.getInitialState(), true);
  //useSmvStore.setState(useSmvStore.getInitialState(), true);
  useMapStore.setState(useMapStore.getInitialState(), true);
  useGlobalStore.setState(useGlobalStore.getInitialState(), true); // last: auth -> null shows <Login />
}