import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // category_id becomes a file name, so only allow safe characters (no ../ tricks)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new NextResponse("Bad id", { status: 400 });
  }

  const dir = process.env.SERVER_CATEGORY_ICONS;
  if (!dir) {
    return new NextResponse("SERVER_CATEGORY_ICONS is not set", { status: 500 });
  }

  try {
    const svg = await fs.readFile(path.join(dir, `${id}.svg`));
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}