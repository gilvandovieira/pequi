import { createCaptureDestination } from "./capture.ts";
import { type NormalizeOptions, normalizeRecords } from "./normalize.ts";

Object.defineProperty(globalThis.process, "env", {
  configurable: true,
  value: {},
});

type PinoFactory = (options: Record<string, unknown>, destination: unknown) => unknown;

let pinoFactory: PinoFactory | undefined;

export type OracleOperation = (logger: OracleLogger) => void;

export interface OracleLogger {
  [key: string]: unknown;
}

export function callMethod(logger: OracleLogger, method: string, ...args: unknown[]): void {
  const value = logger[method];
  if (typeof value !== "function") {
    throw new TypeError(`Logger method not found: ${method}`);
  }
  (value as (...methodArgs: unknown[]) => void).call(logger, ...args);
}

export function childLogger(
  logger: OracleLogger,
  bindings: Record<string, unknown>,
  options?: Record<string, unknown>,
): OracleLogger {
  const value = logger.child;
  if (typeof value !== "function") {
    throw new TypeError("Logger child method not found.");
  }
  return (value as (
    childBindings: Record<string, unknown>,
    childOptions?: Record<string, unknown>,
  ) => OracleLogger).call(logger, bindings, options);
}

export function callGetter<T>(logger: OracleLogger, key: string): T {
  return logger[key] as T;
}

export async function runPinoOracle(
  options: Record<string, unknown>,
  operation: OracleOperation,
  normalizeOptions: NormalizeOptions = {},
): Promise<Record<string, unknown>[]> {
  const capture = createCaptureDestination();
  const pino = await loadPino();
  const logger = pino(options, capture);
  operation(logger as unknown as OracleLogger);
  return normalizeRecords(capture.records(), normalizeOptions);
}

async function loadPino(): Promise<PinoFactory> {
  if (pinoFactory !== undefined) {
    return pinoFactory;
  }

  const pinoModule = await import("npm:pino@10.3.1");
  pinoFactory = pinoModule.default as PinoFactory;
  return pinoFactory;
}
