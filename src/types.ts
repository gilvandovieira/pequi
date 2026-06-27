/**
 * Core type definitions for Pequi's public API.
 *
 * These types describe the {@linkcode Logger} surface, its configuration
 * ({@linkcode LoggerOptions}), log destinations, serializers, redaction, and the backend contract.
 * They are re-exported from the package entrypoint (`@pequi/log`) and intentionally mirror Pino's
 * shape where Pequi implements a compatible subset.
 *
 * @module
 */

/** The six built-in log levels, from least to most severe. */
export type CoreLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Any usable level name: a {@linkcode CoreLogLevel}, the special `"silent"` level, or a custom
 * level registered through {@linkcode LoggerOptions.customLevels}.
 */
export type LogLevel = CoreLogLevel | "silent" | string;

/**
 * How the optional Rust native backend is selected.
 *
 * - `false` — never load native; always use the pure TypeScript backend (the default).
 * - `"auto"` — try native and fall back to pure TypeScript if it cannot load.
 * - `"required"` — throw at startup if native cannot load.
 */
export type NativeMode = false | "auto" | "required";

/**
 * Diagnostics describing how backend selection resolved, including any native fallback reason. Made
 * available through {@linkcode BackendResolution} for callers that need to confirm native actually
 * loaded rather than silently falling back.
 */
export interface NativeDiagnostics {
  /** The {@linkcode NativeMode} the caller requested. */
  requestedMode: NativeMode;
  /** The backend that was actually selected. */
  selectedBackend: "pure" | "native";
  /** Why native was not used, when `selectedBackend` is `"pure"` but native was requested. */
  fallbackReason?: string;
  /** Host operating system at resolution time. */
  os: typeof Deno.build.os;
  /** Host CPU architecture at resolution time. */
  arch: typeof Deno.build.arch;
  /** Library paths the native loader attempted, in order. */
  attemptedLibraryPaths: string[];
  /** ABI version reported by the loaded library, when one loaded. */
  abiVersionFound?: number;
  /** ABI version Pequi requires. */
  abiVersionExpected: number;
  /** Whether `Deno.dlopen` failed. */
  dlopenFailed: boolean;
  /** Whether native initialization failed after the library opened. */
  initFailed: boolean;
  /** Native last-error text, when available. */
  nativeErrorMessage?: string;
}

/** The kinds of built-in {@linkcode ConfiguredDestination}. */
export type DestinationType = "stdout" | "stderr" | "file" | "memory" | "discard";

/**
 * A user-supplied sink. The minimum contract is a synchronous-or-buffered `write`; `flush` and
 * `end` are optional and called when the logger flushes or closes.
 */
export interface WritableDestination {
  /** Write one already-encoded log line. Returning `false` signals backpressure (advisory). */
  write(chunk: string): void | boolean;
  /** Flush any buffered bytes. */
  flush?(): void | Promise<void>;
  /** Release the sink; no further writes follow. */
  end?(): void | Promise<void>;
}

/** Write to the process standard output stream. */
export interface StdoutDestination {
  type: "stdout";
}

/** Write to the process standard error stream. */
export interface StderrDestination {
  type: "stderr";
}

/** Append (or truncate) log lines to a file at {@linkcode FileDestination.path}. */
export interface FileDestination {
  type: "file";
  /** Filesystem path to write to. */
  path: string;
  /** Append to an existing file (the default) instead of truncating it. */
  append?: boolean;
}

/** Collect log lines in the {@linkcode MemoryDestination.lines} array; useful for tests. */
export interface MemoryDestination {
  type: "memory";
  /** Receives each encoded log line. */
  lines: string[];
}

/** Discard every log line; useful for benchmarking the logger without I/O. */
export interface DiscardDestination {
  type: "discard";
}

/** Any built-in destination described declaratively (as opposed to a {@linkcode WritableDestination}). */
export type ConfiguredDestination =
  | StdoutDestination
  | StderrDestination
  | FileDestination
  | MemoryDestination
  | DiscardDestination;

/** Where a logger writes: either a built-in {@linkcode ConfiguredDestination} or a custom sink. */
export type Destination = ConfiguredDestination | WritableDestination;

/** Transforms a value bound to a matching key before it is encoded. */
export type Serializer = (value: unknown) => unknown;

/** A map of binding/log keys to {@linkcode Serializer} functions, keyed by the field name. */
export type Serializers = Record<string, Serializer>;

/** Object form of {@linkcode RedactConfig} with an explicit censor or removal behavior. */
export interface RedactOptions {
  /** Redaction paths (dot/bracket/wildcard syntax) to censor. */
  paths: string[];
  /** Replacement value or a function receiving the value and resolved path. Defaults to `"[Redacted]"`. */
  censor?: string | ((value: unknown, path: string[]) => unknown);
  /** Remove matched keys entirely instead of replacing their value. */
  remove?: boolean;
}

/**
 * Redaction configuration: `false` to disable, a list of paths (default censor), or a full
 * {@linkcode RedactOptions} object.
 */
export type RedactConfig = false | string[] | RedactOptions;

/**
 * Timestamp behavior: `true` for the default epoch-millis time, `false` to omit it, or a function
 * returning the value to place under the time key.
 */
export type TimestampOption = boolean | (() => string | number);

/** Formats the level field; returns the object merged into each log line for the level. */
export interface LevelFormatter {
  (label: string, number: number): Record<string, unknown>;
}

/** Formats binding objects before they are merged into log lines. */
export interface BindingsFormatter {
  (bindings: Record<string, unknown>): Record<string, unknown>;
}

/** Formats the fully assembled log object before encoding. */
export interface LogFormatter {
  (object: Record<string, unknown>): Record<string, unknown>;
}

/** Optional per-stage formatters, mirroring Pino's `formatters` option. */
export interface LoggerFormatters {
  /** Customizes the level field. */
  level?: LevelFormatter;
  /** Customizes binding objects. */
  bindings?: BindingsFormatter;
  /** Customizes the final log object. */
  log?: LogFormatter;
}

/** Merges the {@linkcode LoggerOptions.mixin} result into the log object. */
export type MixinMergeStrategy = (
  mergeObject: Record<string, unknown>,
  mixinObject: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * Intercepts every log call before it is processed, mirroring Pino's `hooks.logMethod`. Bound to
 * the {@linkcode Logger}; call `method.apply(this, args)` to proceed.
 */
export interface LogMethodHook {
  (this: Logger, args: unknown[], method: LogMethod, level: number): void;
}

/** Configuration accepted by the logger factory. All fields are optional. */
export interface LoggerOptions {
  /** Minimum level to emit. Defaults to `"info"`. */
  level?: LogLevel;
  /** Adds a `name` field to every log line. */
  name?: string;
  /** Base bindings merged into every line; `false`/`null` disables the default base. */
  base?: Record<string, unknown> | false | null;
  /** Master on/off switch; `false` suppresses all output. */
  enabled?: boolean;
  /** Per-key value {@linkcode Serializers}. */
  serializers?: Serializers;
  /** {@linkcode RedactConfig} for sensitive fields. */
  redact?: RedactConfig;
  /** {@linkcode NativeMode} backend selection. */
  native?: NativeMode;
  /** Where to write; defaults to stdout. */
  destination?: Destination;
  /** {@linkcode TimestampOption} controlling the time field. */
  timestamp?: TimestampOption;
  /** Key for the message string. Defaults to `"msg"`. */
  messageKey?: string;
  /** Key under which serialized errors are placed. */
  errorKey?: string;
  /** If set, nests log object fields under this key. */
  nestedKey?: string;
  /** String prepended to every message. */
  msgPrefix?: string;
  /** {@linkcode LoggerFormatters} for level/bindings/log stages. */
  formatters?: LoggerFormatters;
  /** Lifecycle hooks. */
  hooks?: {
    /** {@linkcode LogMethodHook} invoked on every log call. */
    logMethod?: LogMethodHook;
  };
  /** Returns an object merged into every log line. */
  mixin?: () => Record<string, unknown>;
  /** Customizes how the {@linkcode LoggerOptions.mixin} result is merged. */
  mixinMergeStrategy?: MixinMergeStrategy;
  /** Use `\r\n` line endings instead of `\n`. */
  crlf?: boolean;
  /** Custom level name → numeric value map. */
  customLevels?: Record<string, number>;
  /** Drop the core levels and use only {@linkcode LoggerOptions.customLevels}. */
  useOnlyCustomLevels?: boolean;
  /** Level ordering: ascending, descending, or a custom comparator. */
  levelComparison?: "ASC" | "DESC" | ((current: number, expected: number) => boolean);
  /** Pino transport config; not implemented in Pequi (throws if used). */
  transport?: unknown;
  /** Pino browser config; accepted but not implemented. */
  browser?: unknown;
  /** Called once for every descendant child created from this logger. */
  onChild?: (child: Logger) => void;
  /** Accepted for Pino compatibility; Pequi is always circular-safe. */
  safe?: boolean;
  /** Maximum nesting depth before values are truncated. */
  depthLimit?: number;
  /** Maximum number of object/array entries before truncation. */
  edgeLimit?: number;
}

/**
 * The write/flush/close sink contract that backends (pure TypeScript or native) implement. The
 * TypeScript layer builds the encoded line and hands it to {@linkcode Backend.write}.
 */
export interface Backend {
  /** Write one encoded log line; `level` is the numeric level for level-aware sinks. */
  write(line: string, level?: number): void;
  /** Flush buffered output. */
  flush(): void | Promise<void>;
  /** Close the backend and release resources. */
  close(): void | Promise<void>;
}

/**
 * The signature of a level method (`info`, `warn`, …). Accepts an optional merge object and/or a
 * printf-style message with arguments, matching Pino's call shapes.
 */
export type LogMethod = (objOrMsg?: unknown, msg?: string, ...args: unknown[]) => void;

/** The logger instance returned by the factory and by {@linkcode Logger.child}. */
export interface Logger {
  /** Log at the `trace` level (10). */
  trace: LogMethod;
  /** Log at the `debug` level (20). */
  debug: LogMethod;
  /** Log at the `info` level (30). */
  info: LogMethod;
  /** Log at the `warn` level (40). */
  warn: LogMethod;
  /** Log at the `error` level (50). */
  error: LogMethod;
  /** Log at the `fatal` level (60). */
  fatal: LogMethod;
  /** No-op level used to disable output. */
  silent: LogMethod;
  /** Create a child logger that inherits config and adds `bindings`. */
  child(bindings: Record<string, unknown>, options?: LoggerOptions): Logger;
  /** Return this logger's own bindings. */
  bindings(): Record<string, unknown>;
  /** Replace this logger's bindings. */
  setBindings(bindings: Record<string, unknown>): void;
  /** Flush the underlying backend. */
  flush(): void | Promise<void>;
  /** Whether `level` would currently emit. */
  isLevelEnabled(level: LogLevel): boolean;
  /** Subscribe to a logger event (e.g. `"level-change"`). */
  on(event: string, listener: (...args: unknown[]) => void): Logger;
  /** Subscribe to a logger event once. */
  once(event: string, listener: (...args: unknown[]) => void): Logger;
  /** Alias for {@linkcode Logger.on}. */
  addListener(event: string, listener: (...args: unknown[]) => void): Logger;
  /** Unsubscribe a previously added listener. */
  removeListener(event: string, listener: (...args: unknown[]) => void): Logger;
  /** Emit a logger event. */
  emit(event: string, ...args: unknown[]): boolean;
  /** The current minimum level; assignable to change it at runtime. */
  level: LogLevel;
  /** The numeric value of the current {@linkcode Logger.level}. */
  readonly levelVal: number;
  /** The active level registry ({@linkcode Levels}). */
  readonly levels: Levels;
  /** The Pequi version string. */
  readonly version: string;
  /** The configured message prefix. */
  readonly msgPrefix: string;
  /** Master on/off switch. */
  enabled: boolean;
}

/** The active level registry: numeric→label and label→numeric maps. */
export interface Levels {
  /** Numeric value to level label. */
  labels: Record<number, string>;
  /** Level label to numeric value. */
  values: Record<string, number>;
}
