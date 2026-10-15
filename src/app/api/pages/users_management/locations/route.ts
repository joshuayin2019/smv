import { NextResponse } from "next/server";
import { loadLocations } from "@/lib/pages/users_management/users_management_controller";

export async function GET() {
  try {
    return NextResponse.json(await loadLocations());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 });
  }
}