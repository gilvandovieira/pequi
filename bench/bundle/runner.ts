import { benchmarkCases, type BundleBenchmarkCase, semanticCases } from "./cases.ts";
import {
  type BenchmarkResult,
  type BundleBenchmarkReport,
  type BundleEnvironment,
  type CorrectnessCaseReport,
  type CorrectnessReport,
  type NativeAvailabilityReport,
  type VariantReport,
} from "./compare.ts";
import {
  allBundleVariants,
  type BundleVariant,
  createBenchmarkSubject,
  experimentalBundleVariants,
  isBundledVariant,
  isNativeVariant,
  type LoadedVariant,
  loadVariant,
  type ReportVariant,
  resolveDefaultNativeLibraryPath,
  verifyNativeLoaded,
} from "./factories.ts";
import { type BundleDestinationKind, parseJsonLines } from "./sinks.ts";

interface RunnerOptions {
  variant: BundleVariant | "all";
  output?: string;
  iterations: number;
  warmup: number;
  nativeLibraryPath?: string;
  destination: BundleDestinationKind;
}

interface CapturedOutput {
  records: Record<string, unknown>[];
  normalized: Record<string, unknown>[];
}

const defaultIterations = 20_000;
const defaultWarmup = 2_000;

export async function runBundleBenchmarks(
  args: string[] = Deno.args,
): Promise<BundleBenchmarkReport> {
  const options = parseArgs(args);
  const nativeLibraryPath = options.nativeLibraryPath ?? resolveDefaultNativeLibraryPath();
  const variants = options.variant === "all" ? allBundleVariants : [options.variant];
  const environment = await collectEnvironment(nativeLibraryPath);
  const reports: VariantReport[] = [];

  for (const variant of variants) {
    reports.push(await runVariant(variant, { ...options, nativeLibraryPath }, environment));
  }

  const report: BundleBenchmarkReport = {
    kind: "pequi-bundle-investigation",
    generatedAt: new Date().toISOString(),
    environment,
    variants: reports,
  };

  if (options.output !== undefined) {
    await writeJson(options.output, report);
  }

  printRunnerSummary(report);
  return report;
}

async function runVariant(
  variant: BundleVariant,
  options: RunnerOptions,
  environment: BundleEnvironment,
): Promise<VariantReport> {
  let loaded: LoadedVariant;
  try {
    loaded = await loadVariant(variant);
  } catch (error) {
    return skippedVariant(variant, errorMessage(error));
  }

  let native: NativeAvailabilityReport = {
    requested: isNativeVariant(variant),
    available: false,
    verified: false,
  };
  let nativeVerifyMs = 0;

  if (loaded.native) {
    try {
      const verifyStarted = performance.now();
      const diagnostics = verifyNativeLoaded(loaded, options.nativeLibraryPath);
      nativeVerifyMs = performance.now() - verifyStarted;
      native = {
        requested: true,
        available: true,
        verified: true,
        diagnostics,
      };
      environment.nativeAbiVersion = diagnostics?.abiVersionFound;
    } catch (error) {
      return {
        variant: loaded.reportVariant,
        status: "skipped",
        modulePath: loaded.modulePath,
        importMs: loaded.importMs,
        skipReason: errorMessage(error),
        correctness: { ok: false, skipped: true, cases: [] },
        native: {
          requested: true,
          available: false,
          verified: false,
          reason: errorMessage(error),
        },
        results: [],
      };
    }
  }

  let startupMs: number | undefined;
  try {
    startupMs = measureStartup(loaded, options, nativeVerifyMs);
  } catch (error) {
    return {
      variant: loaded.reportVariant,
      status: "invalid",
      modulePath: loaded.modulePath,
      importMs: loaded.importMs,
      invalidReason: `Startup smoke failed: ${errorMessage(error)}`,
      correctness: { ok: false, skipped: true, cases: [] },
      native,
      results: [],
    };
  }

  const correctness = await runSemanticEquivalence(loaded, options.nativeLibraryPath);
  const gateCorrectness = shouldGateCorrectness(variant);
  if (gateCorrectness && !correctness.ok) {
    return {
      variant: loaded.reportVariant,
      status: "invalid",
      modulePath: loaded.modulePath,
      importMs: loaded.importMs,
      startupMs,
      invalidReason: firstCorrectnessFailure(correctness),
      correctness,
      native,
      results: [],
    };
  }

  const results: BenchmarkResult[] = [];
  for (const benchCase of benchmarkCases) {
    results.push(await runBenchmarkCase(loaded, benchCase, options));
  }

  return {
    variant: loaded.reportVariant,
    status: "valid",
    modulePath: loaded.modulePath,
    importMs: loaded.importMs,
    startupMs,
    correctness,
    native,
    results,
  };
}

export async function runSemanticEquivalence(
  candidate: LoadedVariant,
  nativeLibraryPath: string | undefined,
): Promise<CorrectnessReport> {
  let source: LoadedVariant;
  try {
    source = await loadVariant("source-pure");
  } catch (error) {
    return {
      ok: false,
      cases: [{ name: "load source baseline", ok: false, reason: errorMessage(error) }],
    };
  }

  const cases: CorrectnessCaseReport[] = [];
  for (const semanticCase of semanticCases) {
    try {
      const sourceOutput = await captureSemanticOutput(source, semanticCase, undefined);
      const candidateOutput = await captureSemanticOutput(
        candidate,
        semanticCase,
        nativeLibraryPath,
      );
      assertSemanticMatch(sourceOutput, candidateOutput, semanticCase.expectedAbsentKeys);
      cases.push({ name: semanticCase.name, ok: true });
    } catch (error) {
      cases.push({ name: semanticCase.name, ok: false, reason: errorMessage(error) });
    }
  }

  return {
    ok: cases.every((testCase) => testCase.ok),
    cases,
  };
}

async function captureSemanticOutput(
  loaded: LoadedVariant,
  semanticCase: (typeof semanticCases)[number],
  nativeLibraryPath: string | undefined,
): Promise<CapturedOutput> {
  const destinationKind = loaded.native ? "file" : "memory";
  const filePath = destinationKind === "file"
    ? await Deno.makeTempFile({ prefix: "pequi-bundle-semantic-", suffix: ".log" })
    : undefined;

  const subject = createBenchmarkSubject(loaded, {
    loggerOptions: semanticCase.options,
    destinationKind,
    nativeLibraryPath,
    filePath,
  });

  try {
    semanticCase.run(subject.logger);
    await flushLogger(subject.logger);
    const text = filePath === undefined
      ? subject.sink === undefined
        ? ""
        : (subject.sink as { lines?: () => string[] }).lines?.().join("\n") ?? ""
      : await Deno.readTextFile(filePath);
    const records = parseJsonLines(text);
    const expectedRecords = semanticCase.expectedRecords ?? 1;
    if (records.length !== expectedRecords) {
      throw new Error(`Expected ${expectedRecords} records, got ${records.length}`);
    }
    return { records, normalized: normalizeRecords(records) };
  } finally {
    await subject.close();
    if (filePath !== undefined) {
      await removeIfExists(filePath);
    }
  }
}

async function runBenchmarkCase(
  loaded: LoadedVariant,
  benchCase: BundleBenchmarkCase,
  options: RunnerOptions,
): Promise<BenchmarkResult> {
  const destination = benchCase.destinationKind ?? options.destination;
  const filePath = destination === "file"
    ? await Deno.makeTempFile({ prefix: "pequi-bundle-bench-", suffix: ".log" })
    : undefined;
  const subject = createBenchmarkSubject(loaded, {
    loggerOptions: benchCase.options,
    destinationKind: destination,
    nativeLibraryPath: options.nativeLibraryPath,
    filePath,
  });
  const logger = benchCase.prepare?.(subject.logger) ?? subject.logger;
  const operationsPerRun = benchCase.operationsPerRun ?? 1;
  const iterations = effectiveIterations(options.iterations, operationsPerRun);
  const warmup = effectiveIterations(options.warmup, operationsPerRun);

  try {
    for (let index = 0; index < warmup; index += 1) {
      benchCase.run(logger);
    }
    subject.reset();

    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      benchCase.run(logger);
    }
    await flushLogger(subject.logger);
    const totalMs = performance.now() - started;
    assertWriteCount(subject, benchCase, iterations);

    const totalOperations = iterations * operationsPerRun;
    const nsPerOp = (totalMs * 1_000_000) / totalOperations;
    return {
      name: benchCase.name,
      group: benchCase.group,
      iterations,
      warmup,
      operationsPerRun,
      totalOperations,
      totalMs,
      opsPerSec: 1_000_000_000 / nsPerOp,
      nsPerOp,
      destination,
    };
  } finally {
    await subject.close();
    if (filePath !== undefined) {
      await removeIfExists(filePath);
    }
  }
}

function assertSemanticMatch(
  source: CapturedOutput,
  candidate: CapturedOutput,
  expectedAbsentKeys: readonly string[] | undefined,
): void {
  const sourceJson = stableJson(source.normalized);
  const candidateJson = stableJson(candidate.normalized);
  if (sourceJson !== candidateJson) {
    throw new Error(`Output mismatch: source=${sourceJson} candidate=${candidateJson}`);
  }

  if (expectedAbsentKeys !== undefined) {
    for (const key of expectedAbsentKeys) {
      for (const record of candidate.records) {
        if (Object.hasOwn(record, key)) {
          throw new Error(`Expected key ${key} to be absent`);
        }
      }
    }
  }
}

function assertWriteCount(
  subject: { sink?: { stats(): { writes: number } } },
  benchCase: BundleBenchmarkCase,
  iterations: number,
): void {
  if (benchCase.expectedWrites === undefined || subject.sink === undefined) {
    return;
  }
  const expected = benchCase.expectedWrites * iterations;
  const actual = subject.sink.stats().writes;
  if (actual !== expected) {
    throw new Error(`${benchCase.name} expected ${expected} writes, got ${actual}`);
  }
}

function normalizeRecords(records: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map(normalizeRecord);
}

function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeValue(record) as Record<string, unknown>;
  delete normalized.time;
  delete normalized.pid;
  delete normalized.hostname;
  delete normalized.v;
  return normalized;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (
      const [key, nested] of Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ) {
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

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function shouldGateCorrectness(variant: BundleVariant): boolean {
  return variant !== "pino-deno" && (variant === "source-pure" || isBundledVariant(variant) ||
    isNativeVariant(variant));
}

function firstCorrectnessFailure(report: CorrectnessReport): string {
  return report.cases.find((testCase) => !testCase.ok)?.reason ?? "Semantic equivalence failed";
}

async function flushLogger(logger: { flush?: () => void | Promise<void> }): Promise<void> {
  await logger.flush?.();
}

function effectiveIterations(targetOperations: number, operationsPerRun: number): number {
  return Math.max(1, Math.floor(targetOperations / operationsPerRun));
}

function measureStartup(
  loaded: LoadedVariant,
  options: RunnerOptions,
  nativeVerifyMs: number,
): number {
  if (loaded.native) {
    return loaded.importMs + nativeVerifyMs;
  }

  const started = performance.now();
  const subject = createBenchmarkSubject(loaded, {
    destinationKind: "discard",
    nativeLibraryPath: options.nativeLibraryPath,
  });
  subject.logger.info("startup smoke");
  subject.close();
  return loaded.importMs + (performance.now() - started);
}

async function collectEnvironment(
  nativeLibraryPath: string | undefined,
): Promise<BundleEnvironment> {
  return {
    deno: Deno.version.deno,
    v8: Deno.version.v8,
    typescript: Deno.version.typescript,
    os: Deno.build.os,
    arch: Deno.build.arch,
    cpu: await readCpuModel(),
    rolldownVersion: await readLockedNpmVersion("rolldown"),
    oxcVersion: await readLockedNpmVersion("@oxc-project/types"),
    pinoVersion: await readLockedNpmVersion("pino"),
    nativeLibraryPath,
  };
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

function parseArgs(args: readonly string[]): RunnerOptions {
  const variant = valueAfter(args, "--variant") ?? "source-pure";
  if (!isRunnerVariant(variant)) {
    throw new Error(`Invalid --variant ${variant}`);
  }

  const destination = valueAfter(args, "--destination") ?? "discard";
  if (!isDestination(destination)) {
    throw new Error(`Invalid --destination ${destination}`);
  }

  return {
    variant,
    output: valueAfter(args, "--output"),
    iterations: numberAfter(args, "--iterations", defaultIterations),
    warmup: numberAfter(args, "--warmup", defaultWarmup),
    nativeLibraryPath: valueAfter(args, "--native-library-path"),
    destination,
  };
}

function isRunnerVariant(value: string): value is BundleVariant | "all" {
  return value === "all" ||
    allBundleVariants.includes(value as BundleVariant) ||
    experimentalBundleVariants.includes(value as BundleVariant);
}

function isDestination(value: string): value is BundleDestinationKind {
  return value === "discard" || value === "memory" || value === "file";
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function numberAfter(args: readonly string[], flag: string, fallback: number): number {
  const value = valueAfter(args, flag);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function skippedVariant(variant: BundleVariant, reason: string): VariantReport {
  return {
    variant: reportVariantForSkipped(variant),
    status: "skipped",
    modulePath: "",
    importMs: 0,
    skipReason: reason,
    correctness: { ok: false, skipped: true, cases: [] },
    native: {
      requested: isNativeVariant(variant),
      available: false,
      verified: false,
      reason,
    },
    results: [],
  };
}

function reportVariantForSkipped(variant: BundleVariant): ReportVariant {
  switch (variant) {
    case "source-pure":
      return "pequi-source-pure";
    case "bundled-pure":
      return "pequi-bundled-pure";
    case "bundled-min-pure":
      return "pequi-bundled-min-pure";
    case "source-native":
      return "pequi-source-native";
    case "bundled-native":
      return "pequi-bundled-native";
    case "pino-deno":
      return "pino-deno";
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.mkdir(new URL(".", pathToFileUrl(path)), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function pathToFileUrl(path: string): URL {
  return new URL(path, `file://${Deno.cwd()}/`);
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

function printRunnerSummary(report: BundleBenchmarkReport): void {
  for (const variant of report.variants) {
    const suffix = variant.status === "valid"
      ? `${variant.results.length} cases`
      : variant.skipReason ?? variant.invalidReason ?? "no results";
    console.log(`${variant.variant}: ${variant.status} (${suffix})`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  await runBundleBenchmarks();
}
