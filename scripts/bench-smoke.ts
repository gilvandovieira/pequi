// Benchmark smoke test (CI gate).
//
// The bundle runner's `import.meta.main` path catches per-variant failures and records them as
// `skipped`/`invalid` instead of exiting non-zero, so running it bare would pass even if a
// benchmark crashed. This wrapper runs the same harness with a tiny iteration count and *asserts*
// that the core variants actually ran and passed their correctness gate. It is a smoke test, not a
// measurement: timings are discarded.
//
// Native variants are tolerated when the prebuilt library or `--allow-ffi` is unavailable (a clean
// skip is correct), but if native is available it must run and pass. `deno task test:native` is the
// hard native gate.

import { runBundleBenchmarks } from "../bench/bundle/runner.ts";
import type { VariantReport } from "../bench/bundle/compare.ts";
import type { ReportVariant } from "../bench/bundle/factories.ts";

const SMOKE_ITERATIONS = "50";
const SMOKE_WARMUP = "10";

// Must load, run, and pass the semantic-equivalence gate.
const requiredPequi: ReportVariant[] = ["pequi-source-pure", "pequi-bundled-pure"];
// Reference logger: must produce timings (no correctness gate of its own).
const requiredReference: ReportVariant[] = ["pino-deno"];
// Accelerated paths: hard-asserted only when the native library actually loads.
const optionalNative: ReportVariant[] = ["pequi-source-native", "pequi-bundled-native"];

const report = await runBundleBenchmarks([
  "--variant",
  "all",
  "--iterations",
  SMOKE_ITERATIONS,
  "--warmup",
  SMOKE_WARMUP,
]);

const byVariant = new Map<ReportVariant, VariantReport>(
  report.variants.map((variant) => [variant.variant, variant]),
);
const problems: string[] = [];

function reasonOf(variant: VariantReport): string {
  return variant.invalidReason ?? variant.skipReason ?? variant.native.reason ?? "no reason given";
}

function requireRan(name: ReportVariant): VariantReport | undefined {
  const variant = byVariant.get(name);
  if (variant === undefined) {
    problems.push(`${name}: missing from report`);
    return undefined;
  }
  if (variant.status !== "valid") {
    problems.push(`${name}: status=${variant.status} (${reasonOf(variant)})`);
    return undefined;
  }
  if (variant.results.length === 0) {
    problems.push(`${name}: produced no benchmark results`);
  }
  return variant;
}

for (const name of requiredPequi) {
  const variant = requireRan(name);
  if (variant !== undefined && !variant.correctness.ok) {
    problems.push(`${name}: semantic-equivalence gate failed`);
  }
}

for (const name of requiredReference) {
  requireRan(name);
}

for (const name of optionalNative) {
  const variant = byVariant.get(name);
  if (variant === undefined) {
    problems.push(`${name}: missing from report`);
    continue;
  }
  if (!variant.native.available) {
    console.log(`  · ${name}: native unavailable (${reasonOf(variant)}) — tolerated`);
    continue;
  }
  const ran = requireRan(name);
  if (ran !== undefined && !ran.correctness.ok) {
    problems.push(`${name}: native semantic-equivalence gate failed`);
  }
}

console.log("\nBenchmark smoke summary:");
for (const variant of report.variants) {
  const cases = variant.results.length;
  const gate = variant.correctness.skipped
    ? "no-gate"
    : (variant.correctness.ok ? "gate-ok" : "GATE-FAIL");
  console.log(
    `  ${variant.status.padEnd(8)} ${variant.variant.padEnd(22)} ${cases} cases  ${gate}`,
  );
}

if (problems.length > 0) {
  console.error("\nBenchmark smoke FAILED:");
  for (const problem of problems) {
    console.error(`  ✗ ${problem}`);
  }
  Deno.exit(1);
}

console.log("\nBenchmark smoke passed.");
