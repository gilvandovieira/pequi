export interface NormalizeOptions {
  keepTime?: boolean;
  keepBase?: boolean;
}

export function normalizeRecords(
  records: Record<string, unknown>[],
  options: NormalizeOptions = {},
): Record<string, unknown>[] {
  return records.map((record) => normalizeRecord(record, options));
}

export function normalizeRecord(
  record: Record<string, unknown>,
  options: NormalizeOptions = {},
): Record<string, unknown> {
  const normalized = normalizeValue(record) as Record<string, unknown>;

  if (options.keepTime !== true) {
    delete normalized.time;
  }

  if (options.keepBase !== true) {
    delete normalized.pid;
    delete normalized.hostname;
  }

  delete normalized.v;
  return normalized;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === "stack") {
        continue;
      }
      next[key] = normalizeValue(nested);
    }
    return next;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
