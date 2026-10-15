import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../types/app";
import type { ApiErrorDetail } from "./app-error";

type ResponseMeta = {
  requestId: string;
};

type SuccessEnvelope<T> = {
  success: true;
  data: T;
  meta: ResponseMeta;
};

type ErrorEnvelope = {
  success: false;
  message: string;
  errors?: ApiErrorDetail[];
  code: string;
  meta: ResponseMeta;
};

export function successResponse<T>(
  context: Context<AppEnv>,
  data: T,
  status: ContentfulStatusCode = 200,
) {
  const body: SuccessEnvelope<T> = {
    success: true,
    data,
    meta: { requestId: context.get("requestId") },
  };

  return context.json(body, status);
}

export function errorResponse(
  context: Context<AppEnv>,
  status: ContentfulStatusCode,
  message: string,
  options: { code: string; errors?: ApiErrorDetail[] },
) {
  const body: ErrorEnvelope = {
    success: false,
    message,
    code: options.code,
    ...(options.errors ? { errors: options.errors } : {}),
    meta: { requestId: context.get("requestId") },
  };

  return context.json(body, status);
}
