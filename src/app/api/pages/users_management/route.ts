import { NextResponse } from "next/server";

import {  loadUsers, createUser } from "@/lib/pages/users_management/users_management_controller"

export async function GET() {

  const result = await loadUsers();

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data);
}



export async function POST(req: Request) {
  try {
    const { user, scopes, modules } = await req.json();

    if (!user || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({ error: "User and at least one scope are required" }, { status: 400 });
    }
    if (!/^\+639\d{9}$/.test(user.phone_number ?? "")) {
      return NextResponse.json({ error: "Phone must be in +639XXXXXXXXX format" }, { status: 400 });
    }
    if ((user.password ?? "").length <= 4) {
      return NextResponse.json({ error: "Password must be longer than 4 characters" }, { status: 400 });
    }

    const result = await createUser(user, scopes, modules ?? []);
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "Username or email already exists" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}