import os from "node:os";
import { pequi } from "../../mod.ts";
import type { LoggerOptions, RedactConfig, Serializers, WritableDestination } from "../../mod.ts";
import { type BenchmarkSink, createDiscardSink } from "./sinks.ts";

// Pino's Node-oriented modules read these at import time, before benchmark options disable them.
Object.defineProperty(globalThis.process, "env", {
  configurable: true,
  value: {},
});

Object.defineProperty(os, "hostname", {
  configurable: true,
  value: () => "benchmark-host",
});

const pinoModule = await import("pino");
const pino = pinoModule.default;

export interface ComparableLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(bindings: Record<string, unknown>, options?: LoggerFactoryOptions): ComparableLogger;
}

export interface BenchmarkSubject {
  name: "pequi-pure" | "pino-deno" | "pequi-native";
  logger: ComparableLogger;
  sink: BenchmarkSink;
  reset(): void;
}

export interface LoggerFactoryOptions {
  level?: string;
  timestamp?: boolean;
  base?: Record<string, unknown> | false | null;
  messageKey?: string;
  errorKey?: string;
  serializers?: Serializers;
  redact?: RedactConfig;
  sink?: BenchmarkSink;
}

type PinoFactory = (
  options: Record<string, unknown>,
  destination: WritableDestination,
) => ComparableLogger;

const defaultOptions = {
  level: "info",
  timestamp: false,
  base: null,
  messageKey: "msg",
  errorKey: "err",
} as const;

export function createPequiPure(options: LoggerFactoryOptions = {}): BenchmarkSubject {
  const sink = options.sink ?? createDiscardSink();
  const logger = pequi({
    ...toPequiOptions(options),
    native: false,
    destination: sink,
  }) as ComparableLogger;

  return createSubject("pequi-pure", logger, sink);
}

export function createPinoDeno(options: LoggerFactoryOptions = {}): BenchmarkSubject {
  const sink = options.sink ?? createDiscardSink();
  const logger = (pino as PinoFactory)(toPinoOptions(options), sink);

  return createSubject("pino-deno", logger, sink);
}

export function createPequiNativeIfAvailable(
  options: LoggerFactoryOptions = {},
): BenchmarkSubject | undefined {
  const sink = options.sink ?? createDiscardSink();

  try {
    const logger = pequi({
      ...toPequiOptions(options),
      native: "required",
      destination: sink,
    }) as ComparableLogger;

    return createSubject("pequi-native", logger, sink);
  } catch {
    return undefined;
  }
}

export function createComparisonSubjects(
  options: Omit<LoggerFactoryOptions, "sink"> = {},
): BenchmarkSubject[] {
  const subjects = [
    createPequiPure(options),
    createPinoDeno(options),
  ];
  const nativeSubject = createPequiNativeIfAvailable(options);
  if (nativeSubject !== undefined) {
    subjects.push(nativeSubject);
  }
  return subjects;
}

function createSubject(
  name: BenchmarkSubject["name"],
  logger: ComparableLogger,
  sink: BenchmarkSink,
): BenchmarkSubject {
  return {
    name,
    logger,
    sink,
    reset(): void {
      sink.reset();
    },
  };
}

function toPequiOptions(options: LoggerFactoryOptions): LoggerOptions {
  return {
    level: options.level ?? defaultOptions.level,
    timestamp: options.timestamp ?? defaultOptions.timestamp,
    base: options.base ?? defaultOptions.base,
    messageKey: options.messageKey ?? defaultOptions.messageKey,
    errorKey: options.errorKey ?? defaultOptions.errorKey,
    serializers: options.serializers,
    redact: options.redact,
  };
}

function toPinoOptions(options: LoggerFactoryOptions): Record<string, unknown> {
  return {
    level: options.level ?? defaultOptions.level,
    timestamp: options.timestamp ?? defaultOptions.timestamp,
    base: options.base ?? defaultOptions.base,
    messageKey: options.messageKey ?? defaultOptions.messageKey,
    errorKey: options.errorKey ?? defaultOptions.errorKey,
    serializers: options.serializers,
    redact: options.redact,
  };
}
