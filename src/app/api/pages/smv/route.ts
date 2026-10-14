import { NextResponse } from "next/server";
import { loadSmv, loadSmvRadius } from "@/lib/pages/smv/smv_controller";

type SmvRequest = {
    mode?: string;
    data?: unknown; // scope
    lat?: unknown; // radius center (smvradius only)
    lng?: unknown;
    m?: unknown; // radius distance in meters
};

// The controllers return either the rows or { error }
function respond(result: unknown) {
    if (result && typeof result === "object" && !Array.isArray(result) && "error" in result) {
        return NextResponse.json({ message: (result as { error: string }).error }, { status: 500 });
    }
    return NextResponse.json(result, { status: 200 });
}

export async function POST(request: Request) {
    let req: SmvRequest;
    try {
        req = await request.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    switch (req.mode) {
        case "loadsmv":
            return respond(await loadSmv(req.data));

        case "smvradius":
            return respond(await loadSmvRadius(req.data, req.lat, req.lng, req.m));

        default:
            return NextResponse.json({ message: "Bad Request" }, { status: 400 });
    }
}
