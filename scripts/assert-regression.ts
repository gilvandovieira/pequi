interface BenchmarkEntry {
  name: string;
  value: number;
}

interface BaselineFile {
  version: number;
  thresholds?: Record<string, Threshold>;
  benchmarks?: Record<string, number> | BenchmarkEntry[];
}

interface Threshold {
  maxRegressionPercent: number;
  hard: boolean;
}

const [baselinePath, currentPath] = Deno.args;

if (baselinePath === undefined || currentPath === undefined) {
  console.error("Usage: deno run scripts/assert-regression.ts <baseline.json> <current.json>");
  Deno.exit(2);
}

const baselineJson = JSON.parse(await Deno.readTextFile(baselinePath)) as BaselineFile;
const currentJson = JSON.parse(await Deno.readTextFile(currentPath)) as unknown;

const baseline = normalizeBenchmarks(baselineJson.benchmarks ?? {});
const current = extractBenchmarks(currentJson);
const thresholds = baselineJson.thresholds ?? defaultThresholds();

const missing: string[] = [];
const added: string[] = [];
const regressions: string[] = [];
const informational: string[] = [];

for (const [name, baselineValue] of baseline) {
  const currentValue = current.get(name);
  if (currentValue === undefined) {
    missing.push(name);
    continue;
  }

  const threshold = thresholdFor(name, thresholds);
  const deltaPercent = ((currentValue - baselineValue) / baselineValue) * 100;
  if (deltaPercent > threshold.maxRegressionPercent) {
    const line = `${name}: ${deltaPercent.toFixed(1)}% slower ` +
      `(baseline ${baselineValue}, current ${currentValue}, threshold ${threshold.maxRegressionPercent}%)`;
    if (threshold.hard) {
      regressions.push(line);
    } else {
      informational.push(line);
    }
  }
}

for (const name of current.keys()) {
  if (!baseline.has(name)) {
    added.push(name);
  }
}

console.log(
  `Compared ${baseline.size} baseline benchmarks against ${current.size} current benchmarks.`,
);
if (missing.length > 0) {
  console.log(`Missing benchmarks (${missing.length}):`);
  for (const name of missing) console.log(`  - ${name}`);
}
if (added.length > 0) {
  console.log(`New benchmarks (${added.length}):`);
  for (const name of added) console.log(`  - ${name}`);
}
if (informational.length > 0) {
  console.log("Informational regressions:");
  for (const line of informational) console.log(`  - ${line}`);
}
if (regressions.length > 0) {
  console.error("Hard benchmark regressions:");
  for (const line of regressions) console.error(`  - ${line}`);
  Deno.exit(1);
}

console.log("No hard benchmark regressions detected.");

function normalizeBenchmarks(
  value: Record<string, number> | BenchmarkEntry[],
): Map<string, number> {
  if (Array.isArray(value)) {
    return new Map(value.map((entry) => [entry.name, entry.value]));
  }
  return new Map(Object.entries(value));
}

function extractBenchmarks(value: unknown): Map<string, number> {
  const entries = new Map<string, number>();
  visit(value, entries);
  return entries;
}

function visit(value: unknown, entries: Map<string, number>): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, entries);
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.name === "string") {
    const metric = extractMetric(record);
    if (metric !== undefined) {
      entries.set(record.name, metric);
    }
  }

  for (const nested of Object.values(record)) {
    if (typeof nested === "object" && nested !== null) {
      visit(nested, entries);
    }
  }
}

function extractMetric(record: Record<string, unknown>): number | undefined {
  for (const key of ["avg", "mean", "median", "p75", "min"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  for (const key of ["ok", "stats", "result", "summary"]) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null) {
      const metric = extractMetric(nested as Record<string, unknown>);
      if (metric !== undefined) {
        return metric;
      }
    }
  }

  return undefined;
}

function thresholdFor(name: string, thresholds: Record<string, Threshold>): Threshold {
  if (name.includes("disabled-level")) return thresholds["disabled-level"];
  if (name.includes("format-only")) return thresholds["format-only"];
  if (name.includes("native-burst") || name.includes(" file ")) {
    return thresholds["native-burst-file"];
  }
  if (name.includes("native-vs-pure")) return thresholds["pure-vs-native"];
  if (name.includes("memory") || name.includes("RSS")) return thresholds.memory;
  return thresholds.default;
}

function defaultThresholds(): Record<string, Threshold> {
  return {
    "disabled-level": { maxRegressionPercent: 10, hard: true },
    "format-only": { maxRegressionPercent: 15, hard: true },
    "native-burst-file": { maxRegressionPercent: 20, hard: true },
    "pure-vs-native": { maxRegressionPercent: 20, hard: false },
    memory: { maxRegressionPercent: 50, hard: false },
    default: { maxRegressionPercent: 20, hard: false },
  };
}
