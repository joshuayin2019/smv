import { useEffect } from "react";
import { region_url, province_url  } from "@/lib/config";
import { trackProgress } from "@/lib/progress";
import { useRegionStore } from "@/stores/boundary/region_stores";
import { useProvinceStore } from "@/stores/boundary/province_stores";


export default function MapDataManagement() {
    const setRegions = useRegionStore((s) => s.setRegions);
    const setProvince = useProvinceStore((s) => s.setProvince);

    // 1) Region (one-time load)
    useEffect(() => {
        if (useRegionStore.getState().regions.length > 0) return;

        const controller = new AbortController();

        trackProgress(async () => {
            try {
                const response = await fetch(region_url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data: {}, mode: "loadregion" }),
                    signal: controller.signal,
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        typeof data?.message === "string" ? data.message : JSON.stringify(data)
                    );
                }

                setRegions(data);
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.log(err instanceof Error ? err.message : err);
            }
        });

        return () => controller.abort();
    }, [setRegions]);

    //Province
    useEffect(() => {
        if (useRegionStore.getState().regions.length > 0) return;

        const controller = new AbortController();

        trackProgress(async () => {
            try {
                const response = await fetch(province_url, {
                    signal: controller.signal,
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        typeof data?.message === "string" ? data.message : JSON.stringify(data)
                    );
                }

                setProvince(data);
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.log(err instanceof Error ? err.message : err);
            }
        });

        return () => controller.abort();
    }, [setProvince]);


    return null;
}