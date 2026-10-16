import { Hono } from "hono";
import type { AppEnv } from "../types/app";
import { StorageService, isManagedImageKey, type ImageContentType } from "../services/storage.service";

export const mediaRoutes = new Hono<AppEnv>();

mediaRoutes.get("/*", async (context) => {
  let key: string;
  try {
    const pathname = new URL(context.req.url).pathname;
    key = decodeURIComponent(pathname.slice("/api/media/".length));
  }
  catch { return context.body(null, 404); }
  if (!isManagedImageKey(key)) return context.body(null, 404);
  if (!context.env.MEDIA_BUCKET) return context.body(null, 404);

  const object = await new StorageService(context.env.MEDIA_BUCKET).get(key);
  if (!object) return context.body(null, 404);
  const extension = key.slice(key.lastIndexOf(".") + 1);
  const expectedMime: ImageContentType = extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp";
  const mime = object.httpMetadata?.contentType ?? expectedMime;
  if (mime !== expectedMime) return context.body(null, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", mime satisfies ImageContentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
});
