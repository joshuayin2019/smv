import { useEffect } from "react";
import { useGlobalStore } from "@/stores/global_stores";
import { usePoiStore, PoiCollection } from "@/stores/poi_stores";
import { basePath } from "@/lib/config";
import { trackProgress } from "@/lib/progress";

const poi_url = `${basePath}/api/pages/poi`;

export default function MapDataManagement() {
    const userId = useGlobalStore((s) => s.auth?.user_id);
    const scopePoi = useGlobalStore((s) => s.auth?.scope_poi);
    const scopeKey = JSON.stringify(scopePoi);

    const setPoi = usePoiStore((s) => s.setPoi);
    const clearPoi = usePoiStore((s) => s.clearPoi);

    // 1) POI
    useEffect(() => {
        if (userId == null) {
            clearPoi();
            return;
        }
        if (!scopePoi) return;

        const controller = new AbortController();

        trackProgress(async () => {
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
                setPoi(data as PoiCollection);
                //console.log(data);
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.log(err instanceof Error ? err.message : err);
            }
        });

        return () => controller.abort();
    }, [userId, scopeKey]);

    // 2) second dataset
    // useEffect(() => {
    //     if (userId == null) return;
    //     const controller = new AbortController();

    //     trackProgress(async () => {
    //         try {
    //             const res = await fetch(`${basePath}/api/pages/other`, {
    //                 signal: controller.signal,
    //             });
    //             const data = await res.json();
    //             // setOther(data);
    //         } catch (err) {
    //             if (err instanceof DOMException && err.name === "AbortError") return;
    //             console.log(err);
    //         }
    //     });

    //     return () => controller.abort();
    // }, [userId]);

    // 3) third dataset: same pattern
    // useEffect(() => {
    //     if (userId == null) return;
    //     const controller = new AbortController();

    //     trackProgress(async () => {
    //         try {
    //             // fetch(..., { signal: controller.signal })
    //         } catch (err) {
    //             if (err instanceof DOMException && err.name === "AbortError") return;
    //             console.log(err);
    //         }
    //     });

    //     return () => controller.abort();
    // }, [userId]);

    return null;
}