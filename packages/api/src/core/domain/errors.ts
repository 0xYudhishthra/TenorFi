// Typed domain errors with stable codes. The HTTP skin maps codes → status,
// the MCP skin maps them → tool errors. One vocabulary, two adapters.

export type KeelErrorCode =
  | "QUOTE_FAILED"
  | "BRIDGE_TIMEOUT"
  | "INSUFFICIENT_ALLOWANCE"
  | "INVALID_TRANSITION"
  | "POSITION_NOT_FOUND"
  | "INTENT_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "EXCHANGE_FAILED"
  | "RECONCILE_FAILED"
  | "INTERNAL";

export interface KeelError {
  code: KeelErrorCode;
  message: string;
  /** Optional structured context — never include secrets. */
  details?: Record<string, unknown>;
  /** Underlying cause, for logs only. */
  cause?: unknown;
}

export function keelError(
  code: KeelErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown
): KeelError {
  return { code, message, details, cause };
}
