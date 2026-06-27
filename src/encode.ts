/**
 * Safe, stable JSON encoding.
 *
 * {@linkcode safeStableStringify} mirrors `JSON.stringify` output but survives circular references,
 * `BigInt`, and other inputs that make `JSON.stringify` throw, while preserving insertion order to
 * match Pino's line output. It is the fallback path used by the formatter when a fast
 * `JSON.stringify` is not safe.
 *
 * @module
 */

/** Truncation limits for {@linkcode safeStableStringify}. */
export interface EncodeOptions {
  /**
   * Maximum object/array nesting depth before deeper values are replaced with `"[Object]"` or
   * `"[Array]"`. Undefined means no limit, which matches Pino's observable default.
   */
  depthLimit?: number;
  /**
   * Maximum number of own keys/elements rendered per object/array before the remainder is
   * summarized. Undefined means no limit, which matches Pino's observable default.
   */
  edgeLimit?: number;
}

const CIRCULAR = '"[Circular]"';

/**
 * JSON encoder that mirrors `JSON.stringify` output while surviving the inputs that make it throw.
 *
 * It preserves insertion order at every level to match Pino's line output, replaces circular
 * references with `"[Circular]"`, and renders `BigInt` as a numeric literal. `toJSON`, `undefined`,
 * function, and symbol values, plus non-finite numbers, follow `JSON.stringify` semantics. Optional
 * depth/edge limits reproduce the truncation tokens of `safe-stable-stringify`, the library Pino
 * wraps.
 */
export function safeStableStringify(value: unknown, options: EncodeOptions = {}): string {
  const depthLimit = options.depthLimit ?? Infinity;
  const edgeLimit = options.edgeLimit ?? Infinity;
  return encodeValue(value, "", [], 1, depthLimit, edgeLimit) ?? "null";
}

function encodeValue(
  value: unknown,
  key: string,
  ancestors: object[],
  depth: number,
  depthLimit: number,
  edgeLimit: number,
): string | undefined {
  // Honor `toJSON` like `JSON.stringify` does (covers Date and custom value objects).
  if (
    value !== null && typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    value = (value as { toJSON: (k: string) => unknown }).toJSON(key);
  }

  switch (typeof value) {
    case "string":
      return quote(value);
    case "number":
      return Number.isFinite(value) ? String(value) : "null";
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return value.toString();
    case "object":
      break;
    default:
      // undefined, function, symbol: omitted from objects, rendered as null in arrays.
      return undefined;
  }

  if (value === null) {
    return "null";
  }

  if (ancestors.includes(value as object)) {
    return CIRCULAR;
  }

  if (depth > depthLimit) {
    return Array.isArray(value) ? '"[Array]"' : '"[Object]"';
  }

  ancestors.push(value as object);
  const result = Array.isArray(value)
    ? encodeArray(value, ancestors, depth, depthLimit, edgeLimit)
    : encodeObject(value as Record<string, unknown>, ancestors, depth, depthLimit, edgeLimit);
  ancestors.pop();
  return result;
}

function encodeObject(
  object: Record<string, unknown>,
  ancestors: object[],
  depth: number,
  depthLimit: number,
  edgeLimit: number,
): string {
  const keys = Object.keys(object);
  const parts: string[] = [];
  let rendered = 0;

  for (const key of keys) {
    if (rendered >= edgeLimit) {
      parts.push(`"...":${quote(truncationMessage(keys.length - rendered, false))}`);
      break;
    }
    const encoded = encodeValue(object[key], key, ancestors, depth + 1, depthLimit, edgeLimit);
    if (encoded === undefined) {
      continue;
    }
    parts.push(`${quote(key)}:${encoded}`);
    rendered++;
  }

  return `{${parts.join(",")}}`;
}

function encodeArray(
  array: unknown[],
  ancestors: object[],
  depth: number,
  depthLimit: number,
  edgeLimit: number,
): string {
  const parts: string[] = [];

  for (let index = 0; index < array.length; index++) {
    if (index >= edgeLimit) {
      const remaining = Math.max(array.length - edgeLimit - 1, 0);
      parts.push(quote(truncationMessage(remaining, true)));
      break;
    }
    const encoded = encodeValue(
      array[index],
      String(index),
      ancestors,
      depth + 1,
      depthLimit,
      edgeLimit,
    );
    parts.push(encoded ?? "null");
  }

  return `[${parts.join(",")}]`;
}

function truncationMessage(remaining: number, isArray: boolean): string {
  const noun = remaining === 1 ? "item" : "items";
  const body = `${remaining} ${noun} not stringified`;
  return isArray ? `... ${body}` : body;
}

/** Delegate string escaping to the engine so it is byte-identical to `JSON.stringify`. */
function quote(value: string): string {
  return JSON.stringify(value);
}
