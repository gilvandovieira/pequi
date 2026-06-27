/**
 * Field redaction.
 *
 * Parses Pino-style redaction paths (dot, bracket, quoted, and wildcard syntax) once at
 * construction via {@linkcode normalizeRedact}, then applies them copy-on-write with
 * {@linkcode redactRecord} so the caller's logged objects are never mutated.
 *
 * @module
 */

import type { RedactConfig, RedactOptions } from "./types.ts";

/** The default replacement value when no censor is configured. */
export const DEFAULT_CENSOR = "[Redacted]";

/** A censor: a literal replacement string, or a function of the value and its resolved path. */
export type Censor = string | ((value: unknown, path: string[]) => unknown);

/** A {@linkcode RedactConfig} normalized into pre-parsed path segments, censor, and remove flag. */
export interface NormalizedRedact {
  /** Each path pre-parsed into segments; `"*"` is the wildcard segment. */
  paths: string[][];
  censor: Censor;
  remove: boolean;
}

// `level` and `time` are written by Pino as a literal prefix and are never redacted, even by an
// explicit path or a root wildcard.
const IMMUTABLE_ROOT_KEYS = new Set(["level", "time"]);

/**
 * Normalize a {@linkcode RedactConfig} into a {@linkcode NormalizedRedact} with pre-parsed paths.
 *
 * @param config The redaction config, or `undefined`/`false` to disable.
 * @returns The normalized config, or `undefined` when redaction is disabled or has no paths.
 */
export function normalizeRedact(config: RedactConfig | undefined): NormalizedRedact | undefined {
  if (config === undefined || config === false) {
    return undefined;
  }

  const raw = Array.isArray(config)
    ? { paths: config, censor: DEFAULT_CENSOR as Censor, remove: false }
    : {
      paths: config.paths,
      censor: config.censor ?? DEFAULT_CENSOR,
      remove: config.remove ?? false,
    };

  if (raw.paths.length === 0) {
    return undefined;
  }

  return {
    paths: raw.paths.map(parsePath),
    censor: raw.censor,
    remove: raw.remove,
  };
}

/**
 * Redacts in place. The caller (`buildRecord`) passes a record that has already been deep-copied by
 * the serializer pass, so mutating it here never touches the user's logged objects.
 */
export function redactRecord(
  record: Record<string, unknown>,
  redact: NormalizedRedact | undefined,
): Record<string, unknown> {
  if (redact === undefined) {
    return record;
  }

  let result = record;
  for (const segments of redact.paths) {
    result = redactContainer(result, segments, 0, [], redact) as Record<string, unknown>;
  }
  return result;
}

/**
 * Splits a redaction path into segments, supporting dot paths (`a.b`), array/bracket access
 * (`a[0]`, `a[*]`), quoted keys with dots (`a["x.y"]`), and wildcards (`*`, `a.*`, `*.b`).
 */
export function parsePath(path: string): string[] {
  const segments: string[] = [];
  let current = "";
  let index = 0;

  const flush = () => {
    if (current.length > 0) {
      segments.push(current);
      current = "";
    }
  };

  while (index < path.length) {
    const char = path[index];
    if (char === ".") {
      flush();
      index++;
    } else if (char === "[") {
      flush();
      index++;
      const quote = path[index];
      if (quote === '"' || quote === "'") {
        index++;
        let key = "";
        while (index < path.length && path[index] !== quote) {
          key += path[index];
          index++;
        }
        index++; // closing quote
        while (index < path.length && path[index] !== "]") {
          index++;
        }
        index++; // closing bracket
        segments.push(key);
      } else {
        let inner = "";
        while (index < path.length && path[index] !== "]") {
          inner += path[index];
          index++;
        }
        index++; // closing bracket
        segments.push(inner);
      }
    } else {
      current += char;
      index++;
    }
  }

  flush();
  return segments;
}

/**
 * Copy-on-write redaction: returns `target` unchanged, or a shallow copy of each container along the
 * matched path with the leaf censored/removed. The caller's logged objects are never mutated, which
 * matters now that the serializer pass no longer always hands redaction a private deep copy.
 */
function redactContainer(
  target: unknown,
  segments: string[],
  index: number,
  trail: string[],
  redact: NormalizedRedact,
): unknown {
  if (typeof target !== "object" || target === null) {
    return target;
  }

  const container = target as Record<string, unknown>;
  const segment = segments[index];
  const isLast = index === segments.length - 1;
  const keys = segment === "*"
    ? Object.keys(container)
    : Object.hasOwn(container, segment)
    ? [segment]
    : [];
  if (keys.length === 0) {
    return target;
  }

  let copy: Record<string, unknown> | null = null;

  for (const key of keys) {
    const nextTrail = [...trail, key];
    if (isLast) {
      if (nextTrail.length === 1 && IMMUTABLE_ROOT_KEYS.has(key)) {
        continue;
      }
      if (copy === null) {
        copy = cloneContainer(container);
      }
      if (redact.remove) {
        delete copy[key];
      } else {
        copy[key] = typeof redact.censor === "function"
          ? redact.censor(copy[key], nextTrail)
          : redact.censor;
      }
    } else {
      const child = container[key];
      const next = redactContainer(child, segments, index + 1, nextTrail, redact);
      if (next !== child) {
        if (copy === null) {
          copy = cloneContainer(container);
        }
        copy[key] = next;
      }
    }
  }

  return copy ?? target;
}

function cloneContainer(container: Record<string, unknown>): Record<string, unknown> {
  return Array.isArray(container)
    ? (container.slice() as unknown as Record<string, unknown>)
    : { ...container };
}

export type { RedactOptions };
