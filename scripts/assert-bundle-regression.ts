import type {
  BenchmarkResult,
  BundleBenchmarkReport,
  VariantReport,
} from "../bench/bundle/compare.ts";
import type { ReportVariant } from "../bench/bundle/factories.ts";

const defaultBaselinePath = "bench/regression/bundle-baseline.json";
const defaultCurrentPath = "bench/reports/bundle-current.json";

const failures: string[] = [];

if (import.meta.main) {
  const baselinePath = Deno.args[0] ?? defaultBaselinePath;
  const currentPath = Deno.args[1] ?? defaultCurrentPath;
  const baseline = await readReport(baselinePath);
  const current = await readReport(currentPath);

  assertSemanticEquivalence(current);
  assertPerformanceRegression(baseline, current);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    Deno.exit(1);
  }

  console.log("Bundle regression check passed");
}

async function readReport(path: string): Promise<BundleBenchmarkReport> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as BundleBenchmarkReport;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound && path === defaultBaselinePath) {
      return {
        kind: "pequi-bundle-investigation",
        generatedAt: new Date(0).toISOString(),
        environment: {
          deno: "",
          v8: "",
          typescript: "",
          os: Deno.build.os,
          arch: Deno.build.arch,
        },
        variants: [],
      };
    }
    throw error;
  }
}

function assertSemanticEquivalence(report: BundleBenchmarkReport): void {
  for (const variant of report.variants) {
    if (variant.variant === "pequi-bundled-min-pure" && !variant.correctness.ok) {
      console.warn(
        `Minified bundle semantic check did not pass; performance results are skipped: ${
          variant.invalidReason ?? variant.skipReason ?? "unknown"
        }`,
      );
      continue;
    }

    if (variant.variant === "pequi-bundled-native" && !variant.native.verified) {
      continue;
    }

    if (variant.variant === "pequi-bundled-pure" || variant.variant === "pequi-bundled-native") {
      if (variant.status === "invalid" || !variant.correctness.ok) {
        failures.push(
          `${variant.variant} failed semantic equivalence: ${
            variant.invalidReason ?? firstCorrectnessFailure(variant) ?? "unknown"
          }`,
        );
      }
    }
  }
}

function assertPerformanceRegression(
  baseline: BundleBenchmarkReport,
  current: BundleBenchmarkReport,
): void {
  compareVariant(baseline, current, "pequi-bundled-pure", thresholdForBundleCase);
  compareAggregate(baseline, current, "pequi-bundled-pure", 0.10);

  const currentNative = current.variants.find((variant) =>
    variant.variant === "pequi-bundled-native"
  );
  if (currentNative?.native.verified === true) {
    compareVariant(baseline, current, "pequi-bundled-native", thresholdForNativeCase);
  }
}

function compareVariant(
  baseline: BundleBenchmarkReport,
  current: BundleBenchmarkReport,
  variantName: ReportVariant,
  thresholdForCase: (result: BenchmarkResult) => number | undefined,
): void {
  const baselineVariant = findVariant(baseline, variantName);
  const currentVariant = findVariant(current, variantName);
  if (baselineVariant === undefined || currentVariant === undefined) {
    return;
  }

  const baselineByName = new Map(baselineVariant.results.map((result) => [result.name, result]));
  for (const currentResult of currentVariant.results) {
    const threshold = thresholdForCase(currentResult);
    if (threshold === undefined) {
      continue;
    }
    const baselineResult = baselineByName.get(currentResult.name);
    if (baselineResult === undefined) {
      continue;
    }

    const allowed = baselineResult.opsPerSec * (1 - threshold);
    if (currentResult.opsPerSec < allowed) {
      const delta = (currentResult.opsPerSec - baselineResult.opsPerSec) /
        baselineResult.opsPerSec;
      failures.push(
        `${variantName} ${currentResult.name} regressed ${(delta * 100).toFixed(1)}% ` +
          `(threshold ${(threshold * 100).toFixed(0)}%)`,
      );
    }
  }
}

function compareAggregate(
  baseline: BundleBenchmarkReport,
  current: BundleBenchmarkReport,
  variantName: ReportVariant,
  threshold: number,
): void {
  const baselineVariant = findVariant(baseline, variantName);
  const currentVariant = findVariant(current, variantName);
  if (baselineVariant === undefined || currentVariant === undefined) {
    return;
  }

  const baselineByName = new Map(baselineVariant.results.map((result) => [result.name, result]));
  const ratios: number[] = [];
  for (const currentResult of currentVariant.results) {
    const baselineResult = baselineByName.get(currentResult.name);
    if (baselineResult !== undefined && baselineResult.opsPerSec > 0) {
      ratios.push(currentResult.opsPerSec / baselineResult.opsPerSec);
    }
  }

  if (ratios.length === 0) {
    return;
  }

  const averageRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  if (averageRatio < 1 - threshold) {
    failures.push(
      `${variantName} aggregate regressed ${((averageRatio - 1) * 100).toFixed(1)}% ` +
        `(threshold ${(threshold * 100).toFixed(0)}%)`,
    );
  }
}

function thresholdForBundleCase(result: BenchmarkResult): number | undefined {
  if (result.name.startsWith("disabled-level")) {
    return 0.15;
  }

  if (result.name === "enabled-string") {
    return 0.15;
  }

  if (result.name === "enabled-object-small" || result.name === "enabled-object-medium") {
    return 0.20;
  }

  if (result.name === "serializer" || result.name === "redaction") {
    return 0.20;
  }

  return undefined;
}

function thresholdForNativeCase(result: BenchmarkResult): number | undefined {
  if (
    result.name === "file-burst-1000" ||
    result.name === "flush-after-1000" ||
    result.name.startsWith("burst-")
  ) {
    return 0.20;
  }

  return undefined;
}

function findVariant(
  report: BundleBenchmarkReport,
  variant: ReportVariant,
): VariantReport | undefined {
  return report.variants.find((candidate) => candidate.variant === variant);
}

function firstCorrectnessFailure(variant: VariantReport): string | undefined {
  return variant.correctness.cases.find((testCase) => !testCase.ok)?.reason;
}
