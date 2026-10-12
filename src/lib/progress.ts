// lib/progress.ts
import { nprogress } from "@mantine/nprogress";

let pending = 0;

export async function trackProgress<T>(task: () => Promise<T>): Promise<T> {
    if (pending++ === 0) nprogress.start();
    try {
        return await task();
    } finally {
        // runs on success, error, and abort, so the count never leaks
        if (--pending === 0) nprogress.complete();
    }
}