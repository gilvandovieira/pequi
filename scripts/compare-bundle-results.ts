import {
  type BundleBenchmarkReport,
  compareVariants,
  formatDelta,
  formatNumber,
  mergeBundleReports,
} from "../bench/bundle/compare.ts";
import type { ReportVariant } from "../bench/bundle/factories.ts";

const defaultReportPath = "bench/reports/bundle-current.json";

if (import.meta.main) {
  const paths = Deno.args.length === 0 ? [defaultReportPath] : Deno.args;
  const report = paths.length === 1
    ? await readReport(paths[0])
    : mergeBundleReports(await Promise.all(paths.map(readReport)));
  printReportComparison(report);
}

export async function readReport(path: string): Promise<BundleBenchmarkReport> {
  return JSON.parse(await Deno.readTextFile(path)) as BundleBenchmarkReport;
}

export function printReportComparison(report: BundleBenchmarkReport): void {
  console.log(`Bundle report: ${report.generatedAt}`);
  console.log(
    `Deno ${report.environment.deno}, ${report.environment.os}/${report.environment.arch}` +
      `, Rolldown ${report.environment.rolldownVersion ?? "unknown"}`,
  );
  console.log("");

  console.log("Variant status");
  for (const variant of report.variants) {
    const correctness = variant.correctness.ok ? "correct" : "correctness failed";
    const native = variant.native.requested
      ? variant.native.verified
        ? "native verified"
        : `native unavailable: ${variant.native.reason ?? "unknown"}`
      : "pure";
    console.log(`- ${variant.variant}: ${variant.status}, ${correctness}, ${native}`);
  }
  console.log("");

  printVariantResults(report);
  printComparisonSection(report, "source vs bundled", "pequi-source-pure", "pequi-bundled-pure");
  printComparisonSection(
    report,
    "bundled vs experimental bundled-min",
    "pequi-bundled-pure",
    "pequi-bundled-min-pure",
  );
  printComparisonSection(report, "source Pequi vs Pino", "pino-deno", "pequi-source-pure");
  printComparisonSection(report, "bundled Pequi vs Pino", "pino-deno", "pequi-bundled-pure");
  printComparisonSection(
    report,
    "native source vs pure source",
    "pequi-source-pure",
    "pequi-source-native",
  );
  printComparisonSection(
    report,
    "native bundled vs pure bundled",
    "pequi-bundled-pure",
    "pequi-bundled-native",
  );
  printComparisonSection(report, "native bundled vs Pino", "pino-deno", "pequi-bundled-native");
}

function printVariantResults(report: BundleBenchmarkReport): void {
  console.log("Results");
  for (const variant of report.variants) {
    if (variant.results.length === 0) {
      continue;
    }
    console.log(`\n${variant.variant}`);
    for (const result of variant.results) {
      console.log(
        `- ${result.name}: ${formatNumber(result.opsPerSec)} ops/sec, ` +
          `${formatNumber(result.nsPerOp)} ns/op`,
      );
    }
  }
  console.log("");
}

function printComparisonSection(
  report: BundleBenchmarkReport,
  label: string,
  baseline: ReportVariant,
  candidate: ReportVariant,
): void {
  const comparisons = compareVariants(report, baseline, candidate);
  if (comparisons.length === 0) {
    console.log(`${label}: unavailable`);
    return;
  }

  console.log(label);
  for (const comparison of comparisons) {
    console.log(
      `- ${comparison.caseName}: ${formatDelta(comparison.delta)} ` +
        `(${formatNumber(comparison.rightOpsPerSec)} vs ` +
        `${formatNumber(comparison.leftOpsPerSec)} ops/sec)`,
    );
  }
  console.log("");
}
