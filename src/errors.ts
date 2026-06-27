export class PequiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PequiError";
  }
}

export interface PequiNativeErrorOptions extends ErrorOptions {
  statusCode?: number;
  operation?: string;
  destinationKind?: number;
  diagnostics?: unknown;
}

export class PequiNativeError extends PequiError {
  readonly statusCode?: number;
  readonly operation?: string;
  readonly destinationKind?: number;
  readonly diagnostics?: unknown;

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

export class NativeBackendUnavailable extends PequiNativeError {
  constructor(message: string, options?: PequiNativeErrorOptions) {
    super(message, options);
    this.name = "NativeBackendUnavailable";
  }
}

export class UnsupportedDestinationError extends PequiError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDestinationError";
  }
}

export class InvalidLogLevelError extends PequiError {
  constructor(level: string) {
    super(`Invalid log level: ${level}`);
    this.name = "InvalidLogLevelError";
  }
}
