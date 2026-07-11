export type ApiErrorCode =
  | "invalid_api_key"
  | "api_key_revoked"
  | "api_key_expired"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "rate_limit_exceeded"
  | "idempotency_conflict"
  | "not_implemented"
  | "internal_error";

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
