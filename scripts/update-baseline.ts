const currentPath = Deno.args[0] ?? "bench/reports/native-current.json";
const baselinePath = Deno.args[1] ?? "bench/regression/baseline.json";

try {
  await Deno.stat(currentPath);
} catch {
  console.log(`Current benchmark report not found at ${currentPath}; running native benchmarks.`);
  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "scripts/bench-native.ts",
      "--json",
      "--output",
      currentPath,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (!status.success) {
    Deno.exit(status.code);
  }
}

const currentJson = JSON.parse(await Deno.readTextFile(currentPath)) as unknown;
const benchmarks = Object.fromEntries(extractBenchmarks(currentJson));

const baseline = {
  version: 1,
  updatedAt: new Date().toISOString(),
  thresholds: {
    "disabled-level": { maxRegressionPercent: 10, hard: true },
    "format-only": { maxRegressionPercent: 15, hard: true },
    "native-burst-file": { maxRegressionPercent: 20, hard: true },
    "pure-vs-native": { maxRegressionPercent: 20, hard: false },
    memory: { maxRegressionPercent: 50, hard: false },
    default: { maxRegressionPercent: 20, hard: false },
  },
  benchmarks,
};

await Deno.mkdir(new URL(".", new URL(baselinePath, `file://${Deno.cwd()}/`)), { recursive: true });
await Deno.writeTextFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`Updated benchmark baseline at ${baselinePath}`);

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
    if (metric !== undefined) entries.set(record.name, metric);
  }
  for (const nested of Object.values(record)) {
    if (typeof nested === "object" && nested !== null) visit(nested, entries);
  }
}

function extractMetric(record: Record<string, unknown>): number | undefined {
  for (const key of ["avg", "mean", "median", "p75", "min"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  for (const key of ["ok", "stats", "result", "summary"]) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null) {
      const metric = extractMetric(nested as Record<string, unknown>);
      if (metric !== undefined) return metric;
    }
  }
  return undefined;
}
