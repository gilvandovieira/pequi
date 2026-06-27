import { discardDestination, fileDestination, pequi } from "../mod.ts";
import type { Logger, LoggerOptions } from "../mod.ts";
import { tryCreateNativeBackend } from "../src/backends/native.ts";
import { normalizeRecords } from "./compat/oracle/normalize.ts";

export interface LoggerCase {
  name: string;
  options?: LoggerOptions;
  run(log: Logger): void;
}

export function nativeAvailable(): boolean {
  const backend = tryCreateNativeBackend({
    mode: "auto",
    destination: discardDestination(),
  });
  backend?.close();
  return backend !== undefined;
}

export async function runLoggerToFile(
  options: LoggerOptions,
  run: (log: Logger) => void,
): Promise<Record<string, unknown>[]> {
  const path = await Deno.makeTempFile({ prefix: "pequi-native-equivalence-", suffix: ".log" });
  try {
    const log = pequi({
      ...options,
      destination: fileDestination(path, { append: false }),
    });
    run(log);
    log.flush();
    const text = await Deno.readTextFile(path);
    return normalizeRecords(parseJsonLines(text));
  } finally {
    await Deno.remove(path);
  }
}

export function parseJsonLines(text: string): Record<string, unknown>[] {
  return text.split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function equivalenceCases(): LoggerCase[] {
  return [
    {
      name: "simple string message",
      run(log) {
        log.info("hello");
      },
    },
    {
      name: "object plus message",
      run(log) {
        log.info({ requestId: "req-1", value: 42 }, "object message");
      },
    },
    {
      name: "formatted string",
      run(log) {
        log.warn({ route: "/users" }, "status %d for %s", 503, "users");
      },
    },
    {
      name: "error plus message",
      run(log) {
        log.error(new Error("boom"), "failed");
      },
    },
    {
      name: "child logger",
      run(log) {
        log.child({ module: "api" }).info("child line");
      },
    },
    {
      name: "serializer",
      options: {
        serializers: {
          user(value) {
            return typeof value === "object" && value !== null
              ? { id: (value as { id?: unknown }).id }
              : value;
          },
        },
      },
      run(log) {
        log.info({ user: { id: "u1", secret: "hidden" } }, "serialized");
      },
    },
    {
      name: "redaction",
      options: { redact: ["password", "token.value"] },
      run(log) {
        log.info({ password: "secret", token: { value: "secret" } }, "redacted");
      },
    },
    {
      name: "formatter",
      options: {
        formatters: {
          log(record) {
            return { ...record, formatted: true };
          },
        },
      },
      run(log) {
        log.info({ value: 1 }, "formatted");
      },
    },
    {
      name: "message error and nested keys",
      options: {
        messageKey: "message",
        errorKey: "error",
        nestedKey: "payload",
      },
      run(log) {
        log.info({ value: 1 }, "nested");
        log.error(new Error("nested boom"), "custom error");
      },
    },
  ];
}
