import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { login } from "@/lib/auth-service";

export async function POST(request: Request) {
  const { data } = await request.json();

  const result = await login(data ?? {});

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  (await cookies()).set("token", result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return NextResponse.json({ user: result.user });
}