// app/api/pages/poi/images/[filename]/route.ts   (Next.js 15 style `params`)
// Folder with the photos is set in .env / .env.local:  POI_IMAGE_DIR=C:\path\to\images
// NOTE: restart `npm run dev` after changing .env, it is only read at startup.
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
};

// Tried in this order when the requested name has no extension (e.g. "2417")
const TRY_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"];

const isDev = process.env.NODE_ENV !== "production";

// In dev the 404 body says WHY, so you can see it by opening the image URL in the browser
function notFound(reason: string) {
    if (isDev) console.warn("poi image 404:", reason);
    return new NextResponse(isDev ? `404: ${reason}` : "Not found", { status: 404 });
}

function ok(file: Buffer, contentType: string) {
    return new NextResponse(new Uint8Array(file), {
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
        },
    });
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const imageDir = process.env.POI_IMAGE_DIR ?? "";
    if (!imageDir) return notFound("POI_IMAGE_DIR is not set (restart the dev server after editing .env)");

    const { filename } = await params;

    // basename() strips any folder parts, so "../../secret" cannot escape the image folder
    const safeName = path.basename(decodeURIComponent(filename));
    const ext = path.extname(safeName);

    // Name already has a known extension -> read it directly
    if (ext) {
        const contentType = CONTENT_TYPES[ext.toLowerCase()];
        if (!contentType) return notFound(`unsupported extension "${ext}" for "${safeName}"`);

        const fullPath = path.join(imageDir, safeName);
        try {
            return ok(await readFile(fullPath), contentType);
        } catch {
            return notFound(`file not found: ${fullPath}`);
        }
    }

    // No extension -> try the common ones
    for (const candidate of TRY_EXTENSIONS) {
        try {
            const file = await readFile(path.join(imageDir, safeName + candidate));
            return ok(file, CONTENT_TYPES[candidate.toLowerCase()]);
        } catch {
            // try the next extension
        }
    }
    return notFound(`no file named "${safeName}" (with ${TRY_EXTENSIONS.join(", ")}) in ${imageDir}`);
}