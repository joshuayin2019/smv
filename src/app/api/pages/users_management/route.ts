import { NextResponse } from "next/server";

import {  loadUsers } from "@/lib/pages/users_management/users_management_controller"

export async function GET() {

  const result = await loadUsers();

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data);
}