import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractBundledImageDataUri } from "@/lib/ui/prototype-media-bank";

export const dynamic = "force-dynamic";

export async function GET() {
  const bundle = await readFile(join(process.cwd(), "data/echo-asset.bundle.js"), "utf8");
  const dataUri = extractBundledImageDataUri(bundle);
  const encoded = dataUri.slice(dataUri.indexOf(",") + 1);
  const bytes = Buffer.from(encoded, "base64");

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Prototype-Media-Policy": "rights-review-required",
    },
  });
}
