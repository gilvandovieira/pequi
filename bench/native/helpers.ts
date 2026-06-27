import { discardDestination, fileDestination, pequi } from "../../mod.ts";
import type { Backend, Logger, LoggerOptions } from "../../mod.ts";
import { createNativeBackend } from "../../src/backends/native.ts";
import { createPureBackend } from "../../src/backends/pure.ts";

export const line = '{"level":30,"msg":"native benchmark"}';

export function nativeAvailable(): boolean {
  try {
    const backend = createNativeBackend({
      mode: "required",
      destination: discardDestination(),
    });
    backend.close();
    return true;
  } catch {
    return false;
  }
}

export function createPureDiscardBackend(): Backend {
  return createPureBackend({ destination: discardDestination() });
}

export function createNativeDiscardBackend(): Backend {
  return createNativeBackend({
    mode: "required",
    destination: discardDestination(),
    bufferSize: 64 * 1024,
  });
}

export function createPureFileBackend(path: string): Backend {
  return createPureBackend({ destination: fileDestination(path, { append: false }) });
}

export function createNativeFileBackend(path: string): Backend {
  return createNativeBackend({
    mode: "required",
    destination: fileDestination(path, { append: false }),
    bufferSize: 64 * 1024,
  });
}

export function createPequiPureLogger(options: LoggerOptions = {}): Logger {
  return pequi({
    level: "info",
    timestamp: false,
    base: null,
    ...options,
    native: false,
    destination: discardDestination(),
  });
}

export function createPequiNativeLogger(options: LoggerOptions = {}): Logger {
  return pequi({
    level: "info",
    timestamp: false,
    base: null,
    ...options,
    native: "required",
    destination: discardDestination(),
  });
}

export function writeBackendBurst(backend: Backend, count: number): void {
  for (let index = 0; index < count; index += 1) {
    backend.write(line);
  }
}

export function runFileBench(
  context: Deno.BenchContext,
  createBackend: (path: string) => Backend,
  count: number,
): void {
  const path = Deno.makeTempFileSync({ prefix: "pequi-native-bench-", suffix: ".log" });
  const backend = createBackend(path);
  try {
    context.start();
    writeBackendBurst(backend, count);
    backend.flush();
    context.end();
  } finally {
    backend.close();
    Deno.removeSync(path);
  }
}

export function assertBackendWritesOnce(backend: Backend): void {
  backend.write(line);
  backend.flush();
}

export function assertDisabledLoggerDoesNotThrow(log: Logger): void {
  log.level = "error";
  log.info("disabled");
  log.flush();
}

export function assertFileOutputCount(
  createBackend: (path: string) => Backend,
  count: number,
): void {
  const path = Deno.makeTempFileSync({ prefix: "pequi-native-bench-guard-", suffix: ".log" });
  const backend = createBackend(path);
  try {
    writeBackendBurst(backend, count);
    backend.flush();
    backend.close();
    const lines = Deno.readTextFileSync(path).split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length !== count) {
      throw new Error(`Expected ${count} benchmark guard lines, got ${lines.length}`);
    }
  } finally {
    Deno.removeSync(path);
  }
}
