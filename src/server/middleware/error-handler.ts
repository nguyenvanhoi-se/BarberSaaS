import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/app";
import { AppError } from "../utils/app-error";
import { errorResponse } from "../utils/http-response";

export const handleError: ErrorHandler<AppEnv> = (error, context) => {
  if (error instanceof AppError) {
    return errorResponse(context, error.status, error.message, {
      code: error.code,
      errors: error.errors,
    });
  }

  if (error instanceof HTTPException) {
    return errorResponse(context, error.status, error.status >= 500 ? "Internal server error" : "Request could not be processed", {
      code: "HTTP_ERROR",
    });
  }

  console.error(JSON.stringify({
    event: "http.unhandled_error",
    requestId: context.get("requestId"),
    errorName: error instanceof Error ? error.name : "UnknownError",
    path: new URL(context.req.url).pathname,
  }));

  return errorResponse(context, 500, "Internal server error", {
    code: "INTERNAL_SERVER_ERROR",
  });
};
