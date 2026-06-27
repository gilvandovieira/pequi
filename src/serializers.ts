/**
 * Error and value serializers.
 *
 * Provides the standard `err` serializer ({@linkcode stdSerializers}), recursive Error
 * serialization, and the copy-on-write passes that apply user {@linkcode Serializers} and serialize
 * nested Errors inside a log record without mutating the caller's objects.
 *
 * @module
 */

import type { Serializers } from "./types.ts";

/** The plain-object shape an Error is serialized into. */
export interface SerializedError {
  /** The error's `name` (defaults to `"Error"`). */
  type: string;
  /** The error's message. */
  message: string;
  /** The stack trace, when present. */
  stack?: string;
  /** The serialized `cause`, when present. */
  cause?: unknown;
  /** Any additional own enumerable properties copied from the error. */
  [key: string]: unknown;
}

/**
 * Type guard for `Error` instances.
 *
 * @param value Candidate value.
 * @returns Whether `value` is an `Error`.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Serialize an Error (and its `cause` chain) into a plain {@linkcode SerializedError} object.
 *
 * @param error The error to serialize.
 * @returns A JSON-safe representation including own enumerable properties.
 */
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

/**
 * The standard `err` serializer: serialize Errors, pass other values through unchanged.
 *
 * @param value The value bound to an `err`/error key.
 * @returns A {@linkcode SerializedError} for Errors, otherwise `value`.
 */
export function errSerializer(value: unknown): unknown {
  return isError(value) ? serializeError(value) : value;
}

/**
 * Like {@linkcode errSerializer}; `serializeError` already follows the `cause` chain, so this is
 * the `errWithCause` alias for Pino compatibility.
 *
 * @param value The value bound to an error key.
 * @returns A {@linkcode SerializedError} for Errors, otherwise `value`.
 */
export function errWithCauseSerializer(value: unknown): unknown {
  return isError(value) ? serializeError(value) : value;
}

/** The built-in serializers exposed as `pequi.stdSerializers`. */
export const stdSerializers = {
  err: errSerializer,
  errWithCause: errWithCauseSerializer,
} as const;

/**
 * Serialize any Error values nested inside a log record, copy-on-write.
 *
 * Returns the original record untouched when nothing needs serializing (the common case); otherwise
 * returns a copy with Errors replaced, leaving the caller's objects unmutated.
 *
 * @param record The log record to scan.
 * @returns The record, or a copy with nested Errors serialized.
 */
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

/**
 * Apply user {@linkcode Serializers} to matching top-level keys of a record, copy-on-write.
 *
 * @param record The log record.
 * @param serializers The configured serializers, or `undefined` for none.
 * @returns The record, or a copy with matching keys transformed.
 */
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
