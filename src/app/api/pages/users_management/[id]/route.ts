import { NextResponse } from "next/server";
import {
  deleteUser,
  parseUniqueViolation,
  updateUser,
} from "@/lib/pages/users_management/users_management_controller";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    const u = await req.json();

    if (!u.full_name?.trim() || !u.address?.trim() || !u.username?.trim()) {
      return NextResponse.json({ error: "Name, address and username are required" }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(u.email ?? "")) {
      return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }
    if (!/^\+639\d{9}$/.test(u.phone_number ?? "")) {
      return NextResponse.json({ error: "Phone must be in +639XXXXXXXXX format" }, { status: 400 });
    }
    if (!["active", "inactive"].includes(u.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (u.password && u.password.length <= 4) {
      return NextResponse.json({ error: "Password must be longer than 4 characters" }, { status: 400 });
    }

    const ok = await updateUser(id, u);
    if (!ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const dup = parseUniqueViolation(err);
    if (dup) return NextResponse.json(dup, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    const ok = await deleteUser(id);
    if (!ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}