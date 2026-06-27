import type { LoggerOptions, Serializers } from "../../mod.ts";
import type { ComparableLogger } from "./factories.ts";
import type { BundleDestinationKind } from "./sinks.ts";
import {
  createError,
  formatArgs,
  mediumObject,
  redactionObject,
  serializerUser,
  smallObject,
} from "./payloads.ts";

export interface BundleBenchmarkCase {
  name: string;
  group: string;
  options?: LoggerOptions;
  destinationKind?: BundleDestinationKind;
  expectedWrites?: number;
  operationsPerRun?: number;
  prepare?(logger: ComparableLogger): ComparableLogger;
  run(logger: ComparableLogger): void;
}

export interface SemanticCase {
  name: string;
  options?: LoggerOptions;
  expectedRecords?: number;
  expectedAbsentKeys?: string[];
  run(logger: ComparableLogger): void;
}

const serializers: Serializers = {
  user(value) {
    return typeof value === "object" && value !== null
      ? { id: (value as { id?: unknown }).id }
      : value;
  },
};

export const benchmarkCases: readonly BundleBenchmarkCase[] = [
  {
    group: "disabled-level",
    name: "disabled-level-string",
    options: { level: "info" },
    expectedWrites: 0,
    run(logger): void {
      logger.debug("disabled message");
    },
  },
  {
    group: "disabled-level",
    name: "disabled-level-object",
    options: { level: "info" },
    expectedWrites: 0,
    run(logger): void {
      logger.debug(smallObject, "disabled message");
    },
  },
  {
    group: "enabled",
    name: "enabled-string",
    run(logger): void {
      logger.info("server started");
    },
  },
  {
    group: "enabled",
    name: "enabled-object-small",
    run(logger): void {
      logger.info(smallObject, "small object");
    },
  },
  {
    group: "enabled",
    name: "enabled-object-medium",
    run(logger): void {
      logger.info(mediumObject, "medium object");
    },
  },
  {
    group: "format",
    name: "format-string",
    run(logger): void {
      logger.info(formatArgs.request[0], formatArgs.request[1], formatArgs.request[2]);
    },
  },
  {
    group: "error",
    name: "error-object",
    run(logger): void {
      logger.error(createError(), "failed");
    },
  },
  {
    group: "child",
    name: "child-bindings",
    prepare(logger): ComparableLogger {
      return logger.child({ module: "auth", requestId: "abc" });
    },
    run(logger): void {
      logger.info(smallObject, "child object message");
    },
  },
  {
    group: "serializer",
    name: "serializer",
    options: { serializers },
    run(logger): void {
      logger.info({ user: serializerUser }, "serialized user");
    },
  },
  {
    group: "redaction",
    name: "redaction",
    options: { redact: ["password", "token", "nested.password"] },
    run(logger): void {
      logger.info(redactionObject, "redacted payload");
    },
  },
  {
    group: "formatter",
    name: "formatter-level",
    options: {
      formatters: {
        level(label, number) {
          return { level: number, severity: label };
        },
      },
    },
    run(logger): void {
      logger.info("formatted level");
    },
  },
  {
    group: "mixin",
    name: "mixin",
    options: {
      mixin() {
        return { requestId: "mixin-req" };
      },
    },
    run(logger): void {
      logger.info("mixin message");
    },
  },
  {
    group: "hooks",
    name: "hooks-log-method",
    options: {
      hooks: {
        logMethod(args, method) {
          const invoke = method as unknown as (this: unknown, ...args: unknown[]) => void;
          invoke.apply(this, [{ hooked: true }, ...args]);
        },
      },
    },
    run(logger): void {
      logger.info("hooked message");
    },
  },
  {
    group: "burst",
    name: "burst-1000",
    expectedWrites: 1_000,
    operationsPerRun: 1_000,
    run(logger): void {
      for (let index = 0; index < 1_000; index += 1) {
        logger.info(smallObject, "burst message");
      }
    },
  },
  {
    group: "burst",
    name: "burst-10000",
    expectedWrites: 10_000,
    operationsPerRun: 10_000,
    run(logger): void {
      for (let index = 0; index < 10_000; index += 1) {
        logger.info(smallObject, "burst message");
      }
    },
  },
  {
    group: "file",
    name: "file-burst-1000",
    destinationKind: "file",
    expectedWrites: 1_000,
    operationsPerRun: 1_000,
    run(logger): void {
      for (let index = 0; index < 1_000; index += 1) {
        logger.info(smallObject, "file burst");
      }
    },
  },
  {
    group: "flush",
    name: "flush-after-1000",
    expectedWrites: 1_000,
    operationsPerRun: 1_000,
    run(logger): void {
      for (let index = 0; index < 1_000; index += 1) {
        logger.info(smallObject, "flush burst");
      }
      logger.flush?.();
    },
  },
];

export const semanticCases: readonly SemanticCase[] = [
  {
    name: "simple message",
    run(logger): void {
      logger.info("hello");
    },
  },
  {
    name: "object + message",
    run(logger): void {
      logger.info({ requestId: "req-1", value: 42 }, "object message");
    },
  },
  {
    name: "formatted message",
    run(logger): void {
      logger.warn({ route: "/users" }, "status %d for %s", 503, "users");
    },
  },
  {
    name: "error logging",
    run(logger): void {
      logger.error(createError(), "failed");
    },
  },
  {
    name: "child logger",
    run(logger): void {
      logger.child({ module: "api" }).info("child line");
    },
  },
  {
    name: "serializer",
    options: { serializers },
    run(logger): void {
      logger.info({ user: serializerUser }, "serialized");
    },
  },
  {
    name: "redaction",
    options: { redact: ["password", "token.value"] },
    run(logger): void {
      logger.info({ password: "secret", token: { value: "secret" } }, "redacted");
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
    run(logger): void {
      logger.info({ value: 1 }, "formatted");
    },
  },
  {
    name: "mixin",
    options: {
      mixin() {
        return { mixinValue: "yes" };
      },
    },
    run(logger): void {
      logger.info({ value: 1 }, "mixin");
    },
  },
  {
    name: "hooks.logMethod",
    options: {
      hooks: {
        logMethod(args, method) {
          const invoke = method as unknown as (this: unknown, ...args: unknown[]) => void;
          invoke.apply(this, [{ hooked: true }, ...args]);
        },
      },
    },
    run(logger): void {
      logger.info("hooked");
    },
  },
  {
    name: "messageKey",
    options: { messageKey: "message" },
    run(logger): void {
      logger.info("custom message key");
    },
  },
  {
    name: "errorKey",
    options: { errorKey: "error" },
    run(logger): void {
      logger.error(createError(), "custom error key");
    },
  },
  {
    name: "nestedKey",
    options: { nestedKey: "payload" },
    run(logger): void {
      logger.info({ value: 1 }, "nested object");
    },
  },
  {
    name: "timestamp false",
    options: { timestamp: false },
    expectedAbsentKeys: ["time"],
    run(logger): void {
      logger.info("no timestamp");
    },
  },
];
