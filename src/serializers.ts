import type { Serializers } from "./types.ts";

export interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  cause?: unknown;
  [key: string]: unknown;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function serializeError(error: Error): SerializedError {
  const serialized: SerializedError = {
    type: error.name || "Error",
    message: error.message,
  };

  if (error.stack !== undefined) {
    serialized.stack = error.stack;
  }

  if ("cause" in error && error.cause !== undefined) {
    serialized.cause = isError(error.cause) ? serializeError(error.cause) : error.cause;
  }

  for (const key of Object.keys(error)) {
    serialized[key] = (error as unknown as Record<string, unknown>)[key];
  }

  return serialized;
}

export function errSerializer(value: unknown): unknown {
  return isError(value) ? serializeError(value) : value;
}

export function errWithCauseSerializer(value: unknown): unknown {
  return isError(value) ? serializeError(value) : value;
}

export const stdSerializers = {
  err: errSerializer,
  errWithCause: errWithCauseSerializer,
} as const;

export function serializeErrorValues(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    next[key] = serializeValue(value);
  }
  return next;
}

function serializeValue(value: unknown): unknown {
  if (isError(value)) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object" && value !== null) {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = serializeValue(nested);
    }
    return next;
  }

  return value;
}

export function applySerializers(
  record: Record<string, unknown>,
  serializers: Serializers | undefined,
): Record<string, unknown> {
  if (serializers === undefined) {
    return record;
  }

  const next = { ...record };
  for (const [key, serializer] of Object.entries(serializers)) {
    if (Object.hasOwn(next, key)) {
      next[key] = serializer(next[key]);
    }
  }
  return next;
}
