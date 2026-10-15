import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorDetail = {
  code: string;
  message: string;
  field?: string;
};

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly errors?: ApiErrorDetail[];

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    errors?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}
