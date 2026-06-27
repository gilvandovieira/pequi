export function parseJsonLines(lines: readonly string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeValue(record) as Record<string, unknown>;
  delete normalized.time;
  delete normalized.pid;
  delete normalized.hostname;
  delete normalized.v;
  return normalized;
}

export function normalizeRecords(
  records: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return records.map(normalizeRecord);
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
