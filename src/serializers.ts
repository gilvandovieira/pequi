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

  const seen = new WeakMap<object, unknown>();
  let copy: Record<string, unknown> | null = null;
  for (const key in record) {
    const value = record[key];
    const serialized = serializeValue(value, seen);
    if (serialized !== value) {
      if (copy === null) {
        copy = { ...record };
      }
      copy[key] = serialized;
    }
  }
  return copy ?? record;
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

  // Copy-on-write: only allocate when a child actually changes (an Error gets serialized). The
  // common no-Error record is returned untouched, and cycles are left intact for the encoder to
  // render as "[Circular]". `seen` maps each object to whatever should replace it (itself until a
  // copy is needed) so a cycle resolves consistently.
  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing;
  }

  if (Array.isArray(value)) {
    seen.set(value, value);
    let copy: unknown[] | null = null;
    for (let index = 0; index < value.length; index++) {
      const item = value[index];
      const serialized = serializeValue(item, seen);
      if (serialized !== item) {
        if (copy === null) {
          copy = value.slice();
          seen.set(value, copy);
        }
        copy[index] = serialized;
      }
    }
    return copy ?? value;
  }

  // Only descend into plain objects. Dates, class instances, and other exotic objects are passed
  // through untouched so their `toJSON` is honored at encode time instead of being flattened to {}.
  if (!isPlainObject(value)) {
    return value;
  }

  seen.set(value, value);
  let copy: Record<string, unknown> | null = null;
  const source = value as Record<string, unknown>;
  for (const key in source) {
    const nested = source[key];
    const serialized = serializeValue(nested, seen);
    if (serialized !== nested) {
      if (copy === null) {
        copy = { ...source };
        seen.set(value, copy);
      }
      copy[key] = serialized;
    }
  }
  return copy ?? value;
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

  // Iterate serializer keys with for-in (no Object.entries allocation) and copy lazily: most
  // records do not have a key matching a serializer, so avoid the spread until the first match.
  let next = record;
  for (const key in serializers) {
    if (Object.hasOwn(record, key)) {
      if (next === record) {
        next = { ...record };
      }
      next[key] = serializers[key](next[key]);
    }
  }
  return next;
}
