// Map typed domain errors → HTTP. One vocabulary (KeelErrorCode) lives in the
// core; this is the only place that knows about status codes.

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { KeelError, KeelErrorCode } from "../core/domain/errors.js";

const CODE_TO_STATUS: Record<KeelErrorCode, ContentfulStatusCode> = {
  VALIDATION_FAILED: 400,
  POSITION_NOT_FOUND: 404,
  INTENT_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  INSUFFICIENT_ALLOWANCE: 409,
  QUOTE_FAILED: 502,
  EXCHANGE_FAILED: 502,
  BRIDGE_TIMEOUT: 504,
  RECONCILE_FAILED: 500,
  INTERNAL: 500,
};

/** Serialize a KeelError as an HTTP JSON error response (never leaks `cause`). */
export function sendError(c: Context, error: KeelError) {
  const status = CODE_TO_STATUS[error.code] ?? 500;
  return c.json(
    { error: { code: error.code, message: error.message, details: error.details } },
    status,
  );
}
