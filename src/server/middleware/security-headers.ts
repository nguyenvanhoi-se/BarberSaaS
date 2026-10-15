import { secureHeaders } from "hono/secure-headers";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/app";

const baseHeaders = secureHeaders({
  referrerPolicy: "strict-origin-when-cross-origin",
  xFrameOptions: "DENY",
  strictTransportSecurity: false,
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
  },
});

export const securityHeaders = createMiddleware<AppEnv>(async (context, next) => {
  await baseHeaders(context, next);
  if (context.env.APP_ENV === "production" && !context.req.path.startsWith("/api/media/")) {
    context.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  }
});
