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

export const V1_WWW_AUTHENTICATE =
  'Bearer realm="Social0 API", resource_metadata="https://api.social0.app/.well-known/oauth-protected-resource"';

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
