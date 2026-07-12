/**
 * Typed, status-bearing error for application code to throw. The global error handler
 * (`errorHandler.ts`) maps unrecognised errors to a generic 500, so raising an `AppError` is how
 * a handler communicates a specific HTTP status and machine-readable `code` back to the client.
 */
export class AppError extends Error {
  // Written as explicit field declarations + constructor-body assignment rather than TS
  // constructor parameter properties: core's sibling AppError is reached by packages/web's
  // `erasableSyntaxOnly` type-check (via the CoreApi Eden import), which rejects parameter
  // property shorthand since it requires emitted code rather than being purely erasable types.
  // Kept identical here so both services' AppError stay in lockstep.
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: string, status: number, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}
