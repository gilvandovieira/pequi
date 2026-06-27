import type { ReportVariant } from "./factories.ts";

export interface BundleBenchmarkReport {
  kind: "pequi-bundle-investigation";
  generatedAt: string;
  environment: BundleEnvironment;
  variants: VariantReport[];
}

export interface BundleEnvironment {
  deno: string;
  v8: string;
  typescript: string;
  os: typeof Deno.build.os;
  arch: typeof Deno.build.arch;
  cpu?: string;
  rolldownVersion?: string;
  oxcVersion?: string;
  pinoVersion?: string;
  nativeLibraryPath?: string;
  nativeAbiVersion?: number;
}

export interface VariantReport {
  variant: ReportVariant;
  status: "valid" | "invalid" | "skipped";
  modulePath: string;
  importMs: number;
  startupMs?: number;
  skipReason?: string;
  invalidReason?: string;
  correctness: CorrectnessReport;
  native: NativeAvailabilityReport;
  results: BenchmarkResult[];
}

export interface CorrectnessReport {
  ok: boolean;
  skipped?: boolean;
  cases: CorrectnessCaseReport[];
}

export interface CorrectnessCaseReport {
  name: string;
  ok: boolean;
  reason?: string;
}

export interface NativeAvailabilityReport {
  requested: boolean;
  available: boolean;
  verified: boolean;
  diagnostics?: unknown;
  reason?: string;
}

export interface BenchmarkResult {
  name: string;
  group: string;
  iterations: number;
  warmup: number;
  operationsPerRun: number;
  totalOperations: number;
  totalMs: number;
  opsPerSec: number;
  nsPerOp: number;
  destination: string;
}

export interface PairComparison {
  caseName: string;
  left: ReportVariant;
  right: ReportVariant;
  leftOpsPerSec: number;
  rightOpsPerSec: number;
  delta: number;
}

export function mergeBundleReports(
  reports: readonly BundleBenchmarkReport[],
): BundleBenchmarkReport {
  const first = reports[0];
  if (first === undefined) {
    throw new Error("Cannot merge zero bundle reports");
  }

  return {
    kind: "pequi-bundle-investigation",
    generatedAt: new Date().toISOString(),
    environment: mergeEnvironment(reports.map((report) => report.environment)),
    variants: reports.flatMap((report) => report.variants),
  };
}

export function compareVariants(
  report: BundleBenchmarkReport,
  left: ReportVariant,
  right: ReportVariant,
): PairComparison[] {
  const leftVariant = report.variants.find((variant) => variant.variant === left);
  const rightVariant = report.variants.find((variant) => variant.variant === right);
  if (leftVariant === undefined || rightVariant === undefined) {
    return [];
  }

  const rightByName = new Map(rightVariant.results.map((result) => [result.name, result]));
  const comparisons: PairComparison[] = [];
  for (const leftResult of leftVariant.results) {
    const rightResult = rightByName.get(leftResult.name);
    if (rightResult === undefined) {
      continue;
    }
    comparisons.push({
      caseName: leftResult.name,
      left,
      right,
      leftOpsPerSec: leftResult.opsPerSec,
      rightOpsPerSec: rightResult.opsPerSec,
      delta: relativeDelta(rightResult.opsPerSec, leftResult.opsPerSec),
    });
  }
  return comparisons;
}

export function relativeDelta(candidate: number, baseline: number): number {
  if (baseline === 0) {
    return candidate === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return (candidate - baseline) / baseline;
}

export function formatDelta(delta: number): string {
  if (!Number.isFinite(delta)) {
    return delta > 0 ? "+inf" : "-inf";
  }
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function mergeEnvironment(environments: readonly BundleEnvironment[]): BundleEnvironment {
  const first = environments[0];
  if (first === undefined) {
    throw new Error("Cannot merge zero environments");
  }

  return {
    ...first,
    rolldownVersion: firstDefined(environments.map((environment) => environment.rolldownVersion)),
    oxcVersion: firstDefined(environments.map((environment) => environment.oxcVersion)),
    pinoVersion: firstDefined(environments.map((environment) => environment.pinoVersion)),
    nativeLibraryPath: firstDefined(
      environments.map((environment) => environment.nativeLibraryPath),
    ),
    nativeAbiVersion: firstDefined(environments.map((environment) => environment.nativeAbiVersion)),
  };
}

function firstDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}
