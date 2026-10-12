import { NextResponse } from "next/server";
import { loadPoi } from "@/lib/pages/poi/poi_controller";

export async function POST(request: Request) {
    let req: { mode?: string; data?: unknown };
    try {
        req = await request.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }




    switch (req.mode) {
        case "loadpoi":
            const result = await loadPoi(req.data);
            if ("error" in result) {
                return NextResponse.json({ message: result.error }, { status: 500 });
            }
            return NextResponse.json( result , { status: 200 });

        default:
            return NextResponse.json({ message: "Bad Request" }, { status: 400 });
    }
}