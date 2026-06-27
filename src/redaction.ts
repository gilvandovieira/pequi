import type { RedactConfig, RedactOptions } from "./types.ts";

export const DEFAULT_CENSOR = "[Redacted]";

interface NormalizedRedactOptions {
  paths: string[];
  censor: string | ((value: unknown, path: string) => unknown);
  remove: boolean;
}

export function normalizeRedact(
  config: RedactConfig | undefined,
): NormalizedRedactOptions | undefined {
  if (config === undefined || config === false) {
    return undefined;
  }

  if (Array.isArray(config)) {
    return { paths: config, censor: DEFAULT_CENSOR, remove: false };
  }

  return {
    paths: config.paths,
    censor: config.censor ?? DEFAULT_CENSOR,
    remove: config.remove ?? false,
  };
}

export function redactRecord(
  record: Record<string, unknown>,
  config: RedactConfig | undefined,
): Record<string, unknown> {
  const normalized = normalizeRedact(config);
  if (normalized === undefined || normalized.paths.length === 0) {
    return record;
  }

  const next = cloneRecord(record);
  for (const path of normalized.paths) {
    redactPath(next, path, normalized);
  }
  return next;
}

function redactPath(
  record: Record<string, unknown>,
  path: string,
  options: NormalizedRedactOptions,
): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    return;
  }

  let target: unknown = record;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(target)) {
      return;
    }
    target = target[part];
  }

  const last = parts.at(-1)!;
  if (!isRecord(target) || !Object.hasOwn(target, last)) {
    return;
  }

  if (options.remove) {
    delete target[last];
    return;
  }

  const current = target[last];
  target[last] = typeof options.censor === "function"
    ? options.censor(current, path)
    : options.censor;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    next[key] = cloneValue(value);
  }
  return next;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isRecord(value)) {
    return cloneRecord(value);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type { RedactOptions };
