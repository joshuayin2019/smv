import { useEffect } from "react";
import { useGlobalStore } from "@/stores/global_stores";


import { poi_url, smv_url  } from "@/lib/config";
import { trackProgress } from "@/lib/progress";

//const poi_url = `${basePath}/api/pages/poi`;
//const smv_url = `${basePath}/api/pages/smv`;

export default function MapDataManagement() {
    const userId = useGlobalStore((s) => s.auth?.user_id);



    // 1) POI
    // useEffect(() => {
    //     console.log(scopePoi);
    //     if (userId == null) {
    //         clearPoi();
    //         return;
    //     }
    //     if (!scopePoi) return;

    //     const controller = new AbortController();

    //     trackProgress(async () => {
    //         try {
    //             const response = await fetch(poi_url, {
    //                 method: "POST",
    //                 headers: { "Content-Type": "application/json" },
    //                 body: JSON.stringify({ data: scopePoi, mode: "loadpoi" }),
    //                 signal: controller.signal,
    //             });
    //             const data = await response.json();

    //             if (!response.ok) {
    //                 throw new Error(
    //                     typeof data?.message === "string" ? data.message : JSON.stringify(data)
    //                 );
    //             }
    //             setPoi(data as PoiCollection);
    //             //console.log(data);
    //         } catch (err) {
    //             if (err instanceof DOMException && err.name === "AbortError") return;
    //             console.log(err instanceof Error ? err.message : err);
    //         }
    //     });

    //     return () => controller.abort();
    // }, [userId, scopeKey_poi]);

    // 2) SMV
    // useEffect(() => {
    //     if (userId == null) {
    //         clearSmv();
    //         return;
    //     }
    //     if (!scopeSmv) return;

    //     const controller = new AbortController();

    //     trackProgress(async () => {
    //         try {
    //             setSmvLoading(true);
    //             const response = await fetch(smv_url, {
    //                 method: "POST",
    //                 headers: { "Content-Type": "application/json" },
    //                 body: JSON.stringify({ data: scopeSmv, mode: "loadsmv" }),
    //                 signal: controller.signal,
    //             });
    //             const data = await response.json();

    //             if (!response.ok) {
    //                 throw new Error(
    //                     typeof data?.message === "string" ? data.message : JSON.stringify(data)
    //                 );
    //             }

    //             const rows = Array.isArray(data) ? data : data.rows ?? [];
    //             setSmvRows(rows);
    //         } catch (err) {
    //             if (err instanceof DOMException && err.name === "AbortError") return;
    //             console.log(err);
    //             setSmvRows([]);
    //         } finally {
    //             if (!controller.signal.aborted) setSmvLoading(false);
    //         }
    //     });

    //     return () => controller.abort();
    // }, [userId, scopeKey_smv]);

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