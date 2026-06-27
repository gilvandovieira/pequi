/**
 * Pequi — a Deno-first structured logger with a Pino-compatible API shape.
 *
 * The default export and the named {@linkcode pequi} export are the same factory; {@linkcode pino}
 * is provided as a drop-in alias. Logs are emitted as JSON lines. The pure TypeScript backend is
 * the default; an optional Rust native sink can be selected with the `native` option.
 *
 * @example Basic usage
 * ```ts
 * import pino from "@pequi/log";
 *
 * const log = pino({ level: "info", name: "api" });
 * log.info({ userId: "123" }, "user logged in");
 * log.error(new Error("boom"), "request failed");
 *
 * const child = log.child({ module: "auth" });
 * child.warn("token nearly expired");
 * ```
 *
 * @module
 */

export {
  pequi,
  pequi as default,
  pino,
  stdSerializers,
  stdTimeFunctions,
  symbols,
  version,
} from "./src/logger.ts";
export {
  destination,
  discardDestination,
  fileDestination,
  memoryDestination,
  stderrDestination,
  stdoutDestination,
} from "./src/destination.ts";
export {
  DEFAULT_LEVEL,
  isLevelEnabled,
  isLogLevel,
  levels,
  levelToNumber,
  pinoLevels,
} from "./src/levels.ts";
export { copyBindings, createBaseBindings, mergeBindings } from "./src/bindings.ts";
export { formatJsonLine, formatMessage, normalizeLogArguments } from "./src/format.ts";
export { type EncodeOptions, safeStableStringify } from "./src/encode.ts";
export {
  multistream,
  type MultiStreamDestination,
  type MultistreamEntry,
  type MultistreamOptions,
} from "./src/multistream.ts";
export {
  type BackendResolution,
  createBackend,
  type CreateBackendOptions,
  resolveBackend,
} from "./src/backend.ts";
export {
  NativeBackendUnavailable,
  PequiError,
  PequiNativeError,
  UnsupportedDestinationError,
} from "./src/errors.ts";
export type {
  Backend,
  ConfiguredDestination,
  Destination,
  DestinationType,
  FileDestination,
  Logger,
  LoggerOptions,
  LogLevel,
  LogMethod,
  MemoryDestination,
  NativeDiagnostics,
  NativeMode,
  RedactConfig,
  Serializer,
  Serializers,
  TimestampOption,
  WritableDestination,
} from "./src/types.ts";
