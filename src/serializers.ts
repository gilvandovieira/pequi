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
  // Fast path: with no object/array/Error values there is nothing to serialize, so skip the
  // rebuild and WeakMap allocation entirely (the common string-message case).
  if (!hasComplexValue(record)) {
    return record;
  }

  const next: Record<string, unknown> = {};
  const seen = new WeakMap<object, unknown>();
  for (const [key, value] of Object.entries(record)) {
    next[key] = serializeValue(value, seen);
  }
  return next;
}

function hasComplexValue(record: Record<string, unknown>): boolean {
  for (const key in record) {
    const value = record[key];
    if (typeof value === "object" && value !== null) {
      return true;
    }
  }
  return false;
}

function serializeValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (isError(value)) {
    return serializeError(value);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  // Returning the in-progress copy keeps cycles intact with consistent identities, so the JSON
  // encoder renders them as "[Circular]" at the same depth Pino does instead of recursing forever.
  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing;
  }

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(serializeValue(item, seen));
    }
    return result;
  }

  // Only descend into plain objects. Dates, class instances, and other exotic objects are passed
  // through untouched so their `toJSON` is honored at encode time instead of being flattened to {}.
  if (!isPlainObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  seen.set(value, next);
  for (const [key, nested] of Object.entries(value)) {
    next[key] = serializeValue(nested, seen);
  }
  return next;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function applySerializers(
  record: Record<string, unknown>,
  serializers: Serializers | undefined,
): Record<string, unknown> {
  if (serializers === undefined) {
    return record;
  }

  // Copy lazily: most records do not have a key matching a serializer, so avoid the spread until
  // the first match actually requires mutating a copy.
  let next = record;
  for (const [key, serializer] of Object.entries(serializers)) {
    if (Object.hasOwn(record, key)) {
      if (next === record) {
        next = { ...record };
      }
      next[key] = serializer(next[key]);
    }
  }
  return next;
}
