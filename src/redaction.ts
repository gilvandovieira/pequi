import type { RedactConfig, RedactOptions } from "./types.ts";

export const DEFAULT_CENSOR = "[Redacted]";

export type Censor = string | ((value: unknown, path: string[]) => unknown);

export interface NormalizedRedact {
  /** Each path pre-parsed into segments; `"*"` is the wildcard segment. */
  paths: string[][];
  censor: Censor;
  remove: boolean;
}

// `level` and `time` are written by Pino as a literal prefix and are never redacted, even by an
// explicit path or a root wildcard.
const IMMUTABLE_ROOT_KEYS = new Set(["level", "time"]);

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

  for (const segments of redact.paths) {
    applyRedaction(record, segments, 0, [], redact);
  }
  return record;
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

function applyRedaction(
  target: unknown,
  segments: string[],
  index: number,
  trail: string[],
  redact: NormalizedRedact,
): void {
  if (typeof target !== "object" || target === null) {
    return;
  }

  const container = target as Record<string, unknown>;
  const segment = segments[index];
  const isLast = index === segments.length - 1;
  const keys = segment === "*"
    ? Object.keys(container)
    : Object.hasOwn(container, segment)
    ? [segment]
    : [];

  for (const key of keys) {
    const nextTrail = [...trail, key];
    if (isLast) {
      if (nextTrail.length === 1 && IMMUTABLE_ROOT_KEYS.has(key)) {
        continue;
      }
      redactKey(container, key, nextTrail, redact);
    } else {
      applyRedaction(container[key], segments, index + 1, nextTrail, redact);
    }
  }
}

function redactKey(
  container: Record<string, unknown>,
  key: string,
  trail: string[],
  redact: NormalizedRedact,
): void {
  if (redact.remove) {
    delete container[key];
    return;
  }

  const current = container[key];
  container[key] = typeof redact.censor === "function"
    ? redact.censor(current, trail)
    : redact.censor;
}

export type { RedactOptions };
