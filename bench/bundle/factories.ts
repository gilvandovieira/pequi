import os from "node:os";
import type {
  Backend,
  BackendResolution,
  CreateBackendOptions,
  Destination,
  Logger,
  LoggerOptions,
  NativeDiagnostics,
  WritableDestination,
} from "../../mod.ts";
import {
  type BenchmarkSink,
  type BundleDestinationKind,
  createDiscardSink,
  createFileSink,
  createMemorySink,
  type FileBenchmarkSink,
  type MemoryBenchmarkSink,
} from "./sinks.ts";

export type BundleVariant =
  | "source-pure"
  | "bundled-pure"
  | "bundled-min-pure"
  | "source-native"
  | "bundled-native"
  | "pino-deno";

export type ReportVariant =
  | "pequi-source-pure"
  | "pequi-bundled-pure"
  | "pequi-bundled-min-pure"
  | "pequi-source-native"
  | "pequi-bundled-native"
  | "pino-deno";

export const allBundleVariants: readonly BundleVariant[] = [
  "source-pure",
  "bundled-pure",
  "source-native",
  "bundled-native",
  "pino-deno",
] as const;

export const experimentalBundleVariants: readonly BundleVariant[] = [
  "bundled-min-pure",
] as const;

export interface ComparableLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(bindings: Record<string, unknown>, options?: LoggerOptions): ComparableLogger;
  flush?(): void | Promise<void>;
}

export interface BenchmarkSubject {
  variant: ReportVariant;
  logger: ComparableLogger;
  sink?: BenchmarkSink;
  filePath?: string;
  nativeDiagnostics?: NativeDiagnostics;
  reset(): void;
  close(): void | Promise<void>;
}

export interface LoadedVariant {
  variant: BundleVariant;
  reportVariant: ReportVariant;
  importMs: number;
  modulePath: string;
  kind: "pequi" | "pino";
  native: boolean;
  pequiModule?: PequiModule;
  pinoFactory?: PinoFactory;
  pinoVersion?: string;
}

export interface CreateSubjectOptions {
  loggerOptions?: LoggerOptions;
  destinationKind: BundleDestinationKind;
  nativeLibraryPath?: string;
  filePath?: string;
}

interface PequiModule {
  pequi: PequiFactory;
  default?: PequiFactory;
  resolveBackend(options?: CreateBackendOptions): BackendResolution;
  discardDestination(): Destination;
  fileDestination(path: string, options?: { append?: boolean }): Destination;
}

type LoggerOptionsWithNativePath = LoggerOptions & {
  nativeLibraryPath?: string;
};

type PequiFactory = (
  options?: LoggerOptionsWithNativePath,
  destination?: Destination,
) => Logger;

type PinoFactory = (
  options: Record<string, unknown>,
  destination: WritableDestination,
) => ComparableLogger;

const defaultLoggerOptions: LoggerOptions = {
  level: "info",
  timestamp: false,
  base: null,
  messageKey: "msg",
  errorKey: "err",
};

export async function loadVariant(variant: BundleVariant): Promise<LoadedVariant> {
  const started = performance.now();

  if (variant === "pino-deno") {
    patchPinoRuntime();
    const pinoModule = await import("pino") as {
      default: PinoFactory & { version?: string };
    };
    return {
      variant,
      reportVariant: toReportVariant(variant),
      importMs: performance.now() - started,
      modulePath: "npm:pino",
      kind: "pino",
      native: false,
      pinoFactory: pinoModule.default,
      pinoVersion: pinoModule.default.version,
    };
  }

  const modulePath = moduleSpecifierForVariant(variant);
  const pequiModule = await import(modulePath) as PequiModule;
  return {
    variant,
    reportVariant: toReportVariant(variant),
    importMs: performance.now() - started,
    modulePath,
    kind: "pequi",
    native: isNativeVariant(variant),
    pequiModule,
  };
}

export function createBenchmarkSubject(
  loaded: LoadedVariant,
  options: CreateSubjectOptions,
): BenchmarkSubject {
  if (loaded.kind === "pino") {
    return createPinoSubject(loaded, options);
  }

  return createPequiSubject(loaded, options);
}

export function verifyNativeLoaded(
  loaded: LoadedVariant,
  nativeLibraryPath: string | undefined,
): NativeDiagnostics | undefined {
  if (!loaded.native) {
    return undefined;
  }

  const pequiModule = requiredPequiModule(loaded);
  const resolution = pequiModule.resolveBackend({
    native: "required",
    nativeLibraryPath,
    destination: pequiModule.discardDestination(),
  });

  closeBackend(resolution.backend);

  if (resolution.diagnostics.selectedBackend !== "native") {
    throw new Error(
      `${loaded.reportVariant} requested native, but selected ` +
        `${resolution.diagnostics.selectedBackend}`,
    );
  }

  return resolution.diagnostics;
}

export function isNativeVariant(variant: BundleVariant): boolean {
  return variant === "source-native" || variant === "bundled-native";
}

export function isBundledVariant(variant: BundleVariant): boolean {
  return variant === "bundled-pure" ||
    variant === "bundled-min-pure" ||
    variant === "bundled-native";
}

export function toReportVariant(variant: BundleVariant): ReportVariant {
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

export function resolveDefaultNativeLibraryPath(): string | undefined {
  const target = resolveNativeTarget();
  if (target === undefined) {
    return undefined;
  }
  const path = `${Deno.cwd()}/prebuilt/${target}/libpequi_log.so`;
  try {
    const stat = Deno.statSync(path);
    return stat.isFile ? path : undefined;
  } catch {
    return undefined;
  }
}

function createPequiSubject(
  loaded: LoadedVariant,
  options: CreateSubjectOptions,
): BenchmarkSubject {
  const pequiModule = requiredPequiModule(loaded);
  const loggerOptions: LoggerOptionsWithNativePath = {
    ...defaultLoggerOptions,
    ...options.loggerOptions,
    native: loaded.native ? "required" : false,
  };

  let sink: BenchmarkSink | undefined;
  let filePath = options.filePath;
  let destination: Destination | undefined;

  if (loaded.native) {
    if (options.destinationKind === "memory") {
      throw new Error("Native benchmarks cannot use memory destinations");
    }
    if (options.nativeLibraryPath !== undefined) {
      loggerOptions.nativeLibraryPath = options.nativeLibraryPath;
    }
    destination = options.destinationKind === "file"
      ? pequiModule.fileDestination(requiredFilePath(filePath), { append: false })
      : pequiModule.discardDestination();
  } else {
    const writable = createWritableSink(options.destinationKind, filePath);
    sink = writable.sink;
    filePath = writable.filePath;
    destination = sink as WritableDestination;
  }

  loggerOptions.destination = destination;
  const logger = pequiModule.pequi(loggerOptions) as ComparableLogger;

  return {
    variant: loaded.reportVariant,
    logger,
    sink,
    filePath,
    reset(): void {
      sink?.reset();
      if (loaded.native && options.destinationKind === "file" && filePath !== undefined) {
        Deno.writeTextFileSync(filePath, "");
      }
    },
    close(): void | Promise<void> {
      return sink?.end();
    },
  };
}

function createPinoSubject(
  loaded: LoadedVariant,
  options: CreateSubjectOptions,
): BenchmarkSubject {
  const pinoFactory = loaded.pinoFactory;
  if (pinoFactory === undefined) {
    throw new Error("Pino factory was not loaded");
  }

  const writable = createWritableSink(options.destinationKind, options.filePath);
  const logger = pinoFactory(toPinoOptions(options.loggerOptions), writable.sink);

  return {
    variant: loaded.reportVariant,
    logger,
    sink: writable.sink,
    filePath: writable.filePath,
    reset(): void {
      writable.sink.reset();
    },
    close(): void {
      writable.sink.end();
    },
  };
}

function createWritableSink(
  destinationKind: BundleDestinationKind,
  filePath: string | undefined,
): { sink: BenchmarkSink | MemoryBenchmarkSink | FileBenchmarkSink; filePath?: string } {
  if (destinationKind === "memory") {
    return { sink: createMemorySink() };
  }

  if (destinationKind === "file") {
    const path = requiredFilePath(filePath);
    return { sink: createFileSink(path), filePath: path };
  }

  return { sink: createDiscardSink() };
}

function toPinoOptions(options: LoggerOptions | undefined): Record<string, unknown> {
  const merged = { ...defaultLoggerOptions, ...options };
  const pinoOptions: Record<string, unknown> = {
    level: merged.level,
    timestamp: merged.timestamp,
    base: merged.base,
    messageKey: merged.messageKey,
    errorKey: merged.errorKey,
  };
  setIfDefined(pinoOptions, "serializers", merged.serializers);
  setIfDefined(pinoOptions, "redact", merged.redact);
  setIfDefined(pinoOptions, "formatters", merged.formatters);
  setIfDefined(pinoOptions, "hooks", merged.hooks);
  setIfDefined(pinoOptions, "mixin", merged.mixin);
  setIfDefined(pinoOptions, "nestedKey", merged.nestedKey);
  return pinoOptions;
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function moduleSpecifierForVariant(variant: BundleVariant): string {
  switch (variant) {
    case "source-pure":
    case "source-native":
      return "../../mod.ts";
    case "bundled-pure":
    case "bundled-native":
      return "../../dist/pequi.bundle.js";
    case "bundled-min-pure":
      return "../../dist/pequi.bundle.min.js";
    case "pino-deno":
      return "pino";
  }
}

function requiredPequiModule(loaded: LoadedVariant): PequiModule {
  if (loaded.pequiModule === undefined) {
    throw new Error(`${loaded.reportVariant} is not a Pequi module`);
  }
  return loaded.pequiModule;
}

function requiredFilePath(filePath: string | undefined): string {
  if (filePath !== undefined) {
    return filePath;
  }
  return Deno.makeTempFileSync({ prefix: "pequi-bundle-bench-", suffix: ".log" });
}

function resolveNativeTarget(): string | undefined {
  if (Deno.build.os !== "linux") {
    return undefined;
  }

  switch (Deno.build.arch) {
    case "x86_64":
      return "linux-x86_64-gnu";
    case "aarch64":
      return "linux-aarch64-gnu";
    default:
      return undefined;
  }
}

function closeBackend(backend: Backend): void {
  const result = backend.close();
  if (result instanceof Promise) {
    throw new Error("Native verification backend close unexpectedly returned a promise");
  }
}

function patchPinoRuntime(): void {
  const globalWithProcess = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const processLike = globalWithProcess.process ?? {};
  Object.defineProperty(globalThis, "process", {
    configurable: true,
    value: processLike,
  });
  Object.defineProperty(processLike, "env", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(os, "hostname", {
    configurable: true,
    value: () => "benchmark-host",
  });
}
