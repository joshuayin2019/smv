import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession } from "@/lib/auth/auth-service";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (token) await revokeSession(token);
  cookieStore.delete("token");
  return NextResponse.json({ ok: true });
}