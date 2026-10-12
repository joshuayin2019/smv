import { useEffect } from "react";
import { useGlobalStore } from "@/stores/global_stores";
import { usePoiStore, PoiCollection } from "@/stores/poi_stores";
import { basePath } from "@/lib/config";

const poi_url = `${basePath}/api/pages/poi`;

export default function MapDataManagement() {
    const userId = useGlobalStore((s) => s.auth?.user_id);
    const scopePoi = useGlobalStore((s) => s.auth?.scope_poi);
    const scopeKey = JSON.stringify(scopePoi); // stable value, unlike the object reference

    //POI stores
    const setPoi = usePoiStore((s) => s.setPoi);
    const clearPoi = usePoiStore((s) => s.clearPoi);

    //POI
    useEffect(() => {
        // user_id is 0 for admin, so don't use a falsy check here
        if (userId == null) {
            clearPoi(); // logged out: drop the data
            return;
        }
        
        if (!scopePoi) return; // user_id is 0 for admin, so no falsy check on userId

        const controller = new AbortController();

        //Load POI Data
        const loadPOI = async () => {
            try {
                const response = await fetch(poi_url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data: scopePoi, mode: "loadpoi" }),
                    signal: controller.signal,
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        typeof data?.message === "string" ? data.message : JSON.stringify(data)
                    );
                }
                console.log(data);
                setPoi(data as PoiCollection);

            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return; // expected
                console.log(err instanceof Error ? err.message : err);
            }
        };

        loadPOI();

        return () => controller.abort(); // cancels the first run in Strict Mode, and on unmount
    }, [userId, scopeKey]); // eslint may warn about scopePoi; scopeKey covers it

    useEffect(() => {
       //load other data
    }, [userId]);

    return null;
}