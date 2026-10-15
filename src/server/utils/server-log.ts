export function logServerError(
  event: string,
  requestId: string,
  error: unknown,
  details: Record<string, string | number | boolean | null> = {},
): void {
  // Error messages and provider payloads can include credentials or user data; retain only the class.
  console.error(JSON.stringify({
    event,
    requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...details,
  }));
}
