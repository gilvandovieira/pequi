import { runBundleBenchmarks } from "../bench/bundle/runner.ts";
import {
  type BundleBenchmarkReport,
  compareVariants,
  formatDelta,
  mergeBundleReports,
} from "../bench/bundle/compare.ts";
import type { BundleVariant, ReportVariant } from "../bench/bundle/factories.ts";
import { resolveDefaultNativeLibraryPath } from "../bench/bundle/factories.ts";
import { buildBundle } from "./build-bundle.ts";
import { printReportComparison } from "./compare-bundle-results.ts";

const sourceReportPath = "reports/bundle-source-current.json";
const bundledReportPath = "reports/bundle-rolldown-current.json";
const minReportPath = "reports/bundle-rolldown-min-current.json";
const nativeReportPath = "reports/bundle-native-current.json";
const rootComparisonPath = "reports/bundle-comparison-current.json";
const benchComparisonPath = "bench/reports/bundle-current.json";

if (import.meta.main) {
  await runInvestigation(Deno.args);
}

export async function runInvestigation(args: readonly string[] = []): Promise<void> {
  const includeMinified = args.includes("--include-minified");
  const nativeLibraryPath = resolveDefaultNativeLibraryPath();
  await printEnvironment(nativeLibraryPath);

  const reports: BundleBenchmarkReport[] = [];

  reports.push(await runVariantReport("source-pure", sourceReportPath, nativeLibraryPath));

  const buildResult = await buildBundle({ minify: includeMinified });
  console.log(`Built bundles with Rolldown ${buildResult.rolldownVersion}`);

  reports.push(await runVariantReport("bundled-pure", bundledReportPath, nativeLibraryPath));
  if (includeMinified) {
    reports.push(await runVariantReport("bundled-min-pure", minReportPath, nativeLibraryPath));
  }

  const nativeReports = [
    await runVariantReport("source-native", "", nativeLibraryPath),
    await runVariantReport("bundled-native", "", nativeLibraryPath),
  ];
  const nativeReport = mergeBundleReports(nativeReports);
  await writeJson(nativeReportPath, nativeReport);
  reports.push(...nativeReports);

  reports.push(await runVariantReport("pino-deno", "", nativeLibraryPath));

  const comparison = mergeBundleReports(reports);
  await writeJson(rootComparisonPath, comparison);
  await writeJson(benchComparisonPath, comparison);

  console.log("");
  printSummary(comparison);
  console.log("");
  printReportComparison(comparison);
}

async function runVariantReport(
  variant: BundleVariant,
  outputPath: string,
  nativeLibraryPath: string | undefined,
): Promise<BundleBenchmarkReport> {
  const args = ["--variant", variant];
  if (outputPath !== "") {
    args.push("--output", outputPath);
  }
  if (nativeLibraryPath !== undefined) {
    args.push("--native-library-path", nativeLibraryPath);
  }
  console.log(`Running ${variant}`);
  return await runBundleBenchmarks(args);
}

async function printEnvironment(nativeLibraryPath: string | undefined): Promise<void> {
  console.log("Environment");
  console.log(`- Deno: ${Deno.version.deno}`);
  console.log(`- V8: ${Deno.version.v8}`);
  console.log(`- TypeScript: ${Deno.version.typescript}`);
  console.log(`- OS/arch: ${Deno.build.os}/${Deno.build.arch}`);
  const cpu = await readCpuModel();
  if (cpu !== undefined) {
    console.log(`- CPU: ${cpu}`);
  }
  console.log(`- Rolldown: ${await readLockedNpmVersion("rolldown") ?? "unknown"}`);
  console.log(`- Oxc: ${await readLockedNpmVersion("@oxc-project/types") ?? "via Rolldown"}`);
  console.log(`- Pino: ${await readLockedNpmVersion("pino") ?? "unknown"}`);
  console.log(`- Native library: ${nativeLibraryPath ?? "unavailable"}`);
}

function printSummary(report: BundleBenchmarkReport): void {
  console.log("Summary");
  printPairSummary(report, "bundled vs source", "pequi-source-pure", "pequi-bundled-pure");
  if (report.variants.some((variant) => variant.variant === "pequi-bundled-min-pure")) {
    printPairSummary(
      report,
      "experimental bundled-min vs source",
      "pequi-source-pure",
      "pequi-bundled-min-pure",
    );
  }
  printPairSummary(report, "source Pequi vs Pino", "pino-deno", "pequi-source-pure");
  printPairSummary(report, "bundled Pequi vs Pino", "pino-deno", "pequi-bundled-pure");
  printPairSummary(
    report,
    "native source vs pure source",
    "pequi-source-pure",
    "pequi-source-native",
  );
  printPairSummary(
    report,
    "native bundled vs pure bundled",
    "pequi-bundled-pure",
    "pequi-bundled-native",
  );
  printPairSummary(report, "native bundled vs Pino", "pino-deno", "pequi-bundled-native");
}

function printPairSummary(
  report: BundleBenchmarkReport,
  label: string,
  baseline: ReportVariant,
  candidate: ReportVariant,
): void {
  const comparisons = compareVariants(report, baseline, candidate);
  if (comparisons.length === 0) {
    console.log(`- ${label}: unavailable`);
    return;
  }

  const averageDelta = comparisons.reduce((sum, comparison) => sum + comparison.delta, 0) /
    comparisons.length;
  console.log(
    `- ${label}: ${formatDelta(averageDelta)} average across ${comparisons.length} cases`,
  );
}

async function readCpuModel(): Promise<string | undefined> {
  if (Deno.build.os !== "linux") {
    return undefined;
  }

  try {
    const cpuInfo = await Deno.readTextFile("/proc/cpuinfo");
    return cpuInfo.split("\n")
      .find((line) => line.startsWith("model name"))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim();
  } catch {
    return undefined;
  }
}

async function readLockedNpmVersion(packageName: string): Promise<string | undefined> {
  try {
    const lock = JSON.parse(await Deno.readTextFile("deno.lock")) as {
      specifiers?: Record<string, string>;
      npm?: Record<string, unknown>;
    };
    for (const [specifier, version] of Object.entries(lock.specifiers ?? {})) {
      if (specifier.startsWith(`npm:${packageName}@`)) {
        return version;
      }
    }
    const prefix = `${packageName}@`;
    return Object.keys(lock.npm ?? {})
      .find((entry) => entry.startsWith(prefix))
      ?.slice(prefix.length)
      .split("_")[0];
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.mkdir(new URL(".", pathToFileUrl(path)), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function pathToFileUrl(path: string): URL {
  return new URL(path, `file://${Deno.cwd()}/`);
}
