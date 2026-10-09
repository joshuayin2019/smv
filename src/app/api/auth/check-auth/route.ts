import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth-service";

export async function GET() {
  const token = (await cookies()).get("token")?.value;
  const user = token ? await verifySession(token) : null;

  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}