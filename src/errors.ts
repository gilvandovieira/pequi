export class PequiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PequiError";
  }
}

export class NativeBackendUnavailable extends PequiError {
  constructor(message: string, options?: ErrorOptions) {
    super(message);
    this.name = "NativeBackendUnavailable";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
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
