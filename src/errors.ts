/**
 * Error types thrown by Pequi.
 *
 * {@linkcode PequiError} is the base class for every Pequi-specific error, so callers can catch all
 * of them with a single `instanceof` check. Native-backend failures use the
 * {@linkcode PequiNativeError} subtree.
 *
 * @module
 */

/** Base class for all Pequi-specific errors. */
export class PequiError extends Error {
  /** @param message Human-readable error description. */
  constructor(message: string) {
    super(message);
    this.name = "PequiError";
  }
}

/** Extra context attached to a {@linkcode PequiNativeError}. */
export interface PequiNativeErrorOptions extends ErrorOptions {
  /** Native status code returned across the FFI boundary, when available. */
  statusCode?: number;
  /** The native operation that failed (e.g. `"write"`, `"flush"`). */
  operation?: string;
  /** The native destination kind involved. */
  destinationKind?: number;
  /** Native diagnostics captured at failure time. */
  diagnostics?: unknown;
}

/** Raised when the Rust native backend fails during initialization, write, flush, or close. */
export class PequiNativeError extends PequiError {
  readonly statusCode?: number;
  readonly operation?: string;
  readonly destinationKind?: number;
  readonly diagnostics?: unknown;

  /**
   * @param message Human-readable error description.
   * @param options Optional native context ({@linkcode PequiNativeErrorOptions}).
   */
  constructor(message: string, options: PequiNativeErrorOptions = {}) {
    super(message);
    this.name = "PequiNativeError";
    this.statusCode = options.statusCode;
    this.operation = options.operation;
    this.destinationKind = options.destinationKind;
    this.diagnostics = options.diagnostics;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Raised in `native: "required"` mode when the native library cannot be loaded or initialized. In
 * `native: "auto"` mode this condition is captured in diagnostics and Pequi falls back to pure
 * TypeScript instead of throwing.
 */
export class NativeBackendUnavailable extends PequiNativeError {
  constructor(message: string, options?: PequiNativeErrorOptions) {
    super(message, options);
    this.name = "NativeBackendUnavailable";
  }
}

/** Raised when a destination cannot be turned into a usable sink. */
export class UnsupportedDestinationError extends PequiError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDestinationError";
  }
}

/** Raised when an unknown level name is used. */
export class InvalidLogLevelError extends PequiError {
  /** @param level The offending level name. */
  constructor(level: string) {
    super(`Invalid log level: ${level}`);
    this.name = "InvalidLogLevelError";
  }
}
