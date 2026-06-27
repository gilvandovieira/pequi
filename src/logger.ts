/**
 * The logger factory and core logging pipeline.
 *
 * This module assembles everything else: it normalizes options, builds the level registry,
 * serializers, redaction, and backend, and produces the {@linkcode Logger}. The {@linkcode pequi}
 * factory (aliased as {@linkcode pino}) is the package's main entrypoint, re-exported from
 * `@pequi/log`.
 *
 * @module
 */

import { createBackend } from "./backend.ts";
import { copyBindings, createBaseBindings, mergeBindings } from "./bindings.ts";
import { destination as createDestination, isWritableDestination } from "./destination.ts";
import type { EncodeOptions } from "./encode.ts";
import { formatJsonLine, normalizeLogArguments } from "./format.ts";
import {
  assertLevelConfigured,
  buildLevelRegistry,
  CORE_LEVEL_NAMES,
  DEFAULT_LEVEL,
  type LevelComparisonOption,
  type LevelRegistry,
  pinoLevels,
} from "./levels.ts";
import { multistream } from "./multistream.ts";
import { type NormalizedRedact, normalizeRedact, redactRecord } from "./redaction.ts";
import {
  applySerializers,
  errSerializer,
  errWithCauseSerializer,
  serializeErrorValues,
  stdSerializers,
} from "./serializers.ts";
import type {
  Backend,
  Destination,
  Logger,
  LoggerFormatters,
  LoggerOptions,
  LogLevel,
  LogMethod,
  MixinMergeStrategy,
  Serializers,
  TimestampOption,
} from "./types.ts";

/** The Pequi version string, also exposed as `logger.version`. */
export const version = "0.8.0";

/** Well-known symbols exposed as `pequi.symbols`, mirroring Pino. */
export interface PequiSymbols {
  /** The serializers symbol. */
  serializers: symbol;
  /** Alias of {@linkcode PequiSymbols.serializers} for Pino compatibility. */
  serializersSym: symbol;
}

/** The built-in timestamp functions exposed as `pequi.stdTimeFunctions`. */
export interface PequiStdTimeFunctions {
  /** Returns the epoch-millis time fragment (`,"time":<ms>`). */
  epochTime(): string;
  /** Returns the ISO-8601 time fragment (`,"time":"<iso>"`). */
  isoTime(): string;
}

/** Well-known symbols, mirroring Pino's `pino.symbols`. */
export const symbols: PequiSymbols = {
  serializers: Symbol.for("pino.serializers"),
  serializersSym: Symbol.for("pino.serializers"),
};

/** Built-in timestamp functions, mirroring Pino's `pino.stdTimeFunctions`. */
export const stdTimeFunctions: PequiStdTimeFunctions = {
  epochTime(): string {
    return `,"time":${Date.now()}`;
  },
  isoTime(): string {
    return `,"time":"${new Date().toISOString()}"`;
  },
} as const;

interface LoggerState {
  backend: Backend;
  level: LogLevel;
  levelValue: number;
  levels: LevelRegistry;
  customLevels?: Record<string, number>;
  useOnlyCustomLevels?: boolean;
  levelComparison?: LevelComparisonOption;
  enabled: boolean;
  baseFields: Record<string, unknown>;
  bindings: Record<string, unknown>;
  serializers: Serializers;
  redact?: NormalizedRedact;
  timestamp?: TimestampOption;
  messageKey: string;
  errorKey: string;
  nestedKey?: string;
  msgPrefix: string;
  formatters: LoggerFormatters;
  hooks: LoggerOptions["hooks"];
  mixin?: () => Record<string, unknown>;
  mixinMergeStrategy?: MixinMergeStrategy;
  lineEnding: "\n" | "\r\n";
  encode: EncodeOptions;
  onChild?: (child: Logger) => void;
  events: EventRegistry;
}

type LoggerOptionsWithNativeOverrides = LoggerOptions & {
  nativeLibraryPath?: string;
};

type EventListener = (...args: unknown[]) => void;
type EventRegistry = Map<string, Set<EventListener>>;

/**
 * The callable {@linkcode pequi} factory and its attached helpers, mirroring Pino's default export.
 *
 * Call it with options and/or a destination to build a {@linkcode Logger}; the attached members
 * ({@linkcode PequiFactory.destination}, {@linkcode PequiFactory.multistream}, etc.) mirror Pino's
 * static surface.
 */
export interface PequiFactory {
  /** Create a logger from options. */
  (options?: LoggerOptions): Logger;
  /** Create a logger writing to `destination`. */
  (destination: Destination): Logger;
  /** Create a logger from options writing to `destination`. */
  (options: LoggerOptions, destination: Destination): Logger;
  /** Resolve a destination argument into a writable (see {@linkcode destination}). */
  destination: typeof createDestination;
  /** Pino transport entrypoint; not implemented in Pequi (throws when called). */
  transport: () => never;
  /** Fan output out to multiple destinations (see {@linkcode multistream}). */
  multistream: typeof multistream;
  /** The built-in serializers. */
  stdSerializers: typeof stdSerializers;
  /** The built-in timestamp functions. */
  stdTimeFunctions: typeof stdTimeFunctions;
  /** Well-known symbols. */
  symbols: typeof symbols;
  /** The Pequi version string. */
  version: string;
  /** The default level registry. */
  levels: typeof pinoLevels;
}

function pequiFactory(
  optionsOrDestination: LoggerOptions | Destination = {},
  maybeDestination?: Destination,
): Logger {
  const { options, destination } = normalizeFactoryArguments(
    optionsOrDestination,
    maybeDestination,
  );
  const nativeLibraryPath = (options as LoggerOptionsWithNativeOverrides).nativeLibraryPath;
  const lineEnding = options.crlf === true ? "\r\n" : "\n";
  const backend = createBackend({
    native: options.native,
    destination,
    lineEnding,
    nativeLibraryPath,
  });

  const levelRegistry = buildLevelRegistry({
    customLevels: options.customLevels,
    useOnlyCustomLevels: options.useOnlyCustomLevels,
    levelComparison: options.levelComparison,
  });
  const level = options.level ?? DEFAULT_LEVEL;
  assertLevelConfigured(level, levelRegistry, options.useOnlyCustomLevels);

  return createLogger({
    backend,
    level,
    levelValue: levelRegistry.valueOf(level),
    levels: levelRegistry,
    customLevels: options.customLevels,
    useOnlyCustomLevels: options.useOnlyCustomLevels,
    levelComparison: options.levelComparison,
    enabled: options.enabled ?? true,
    baseFields: createDefaultBaseFields(options),
    bindings: createBaseBindings({
      name: options.name,
      base: options.base,
    }),
    serializers: createSerializers(options.serializers, options.errorKey ?? "err"),
    redact: normalizeRedact(options.redact),
    timestamp: options.timestamp,
    messageKey: options.messageKey ?? "msg",
    errorKey: options.errorKey ?? "err",
    nestedKey: options.nestedKey,
    msgPrefix: options.msgPrefix ?? "",
    formatters: options.formatters ?? {},
    hooks: options.hooks,
    mixin: options.mixin,
    mixinMergeStrategy: options.mixinMergeStrategy,
    lineEnding,
    encode: { depthLimit: options.depthLimit, edgeLimit: options.edgeLimit },
    onChild: options.onChild,
    events: new Map(),
  });
}

/**
 * The Pequi logger factory and the package's default export.
 *
 * Call it with options and/or a destination to create a {@linkcode Logger}; static helpers are
 * attached per {@linkcode PequiFactory}.
 *
 * @example
 * ```ts
 * import { pequi } from "@pequi/log";
 * const log = pequi({ level: "debug" });
 * log.debug("ready");
 * ```
 */
export const pequi = Object.assign(pequiFactory, {
  destination: createDestination,
  transport: notImplemented("transport"),
  multistream,
  stdSerializers,
  stdTimeFunctions,
  symbols,
  version,
  levels: pinoLevels,
}) as PequiFactory;

/** Drop-in alias of {@linkcode pequi} for Pino-style `import pino from "@pequi/log"` usage. */
export const pino = pequi;

function createLogger(state: LoggerState): Logger {
  const logger: Logger = {
    trace: createLogMethod(state, "trace", 10),
    debug: createLogMethod(state, "debug", 20),
    info: createLogMethod(state, "info", 30),
    warn: createLogMethod(state, "warn", 40),
    error: createLogMethod(state, "error", 50),
    fatal: createLogMethod(state, "fatal", 60),
    silent: () => {},
    child(bindings: Record<string, unknown>, options: LoggerOptions = {}): Logger {
      const childPrefix = options.msgPrefix === undefined
        ? state.msgPrefix
        : `${state.msgPrefix}${options.msgPrefix}`;

      const childCustomLevels =
        state.customLevels !== undefined || options.customLevels !== undefined
          ? { ...state.customLevels, ...options.customLevels }
          : undefined;
      const childUseOnlyCustomLevels = options.useOnlyCustomLevels ?? state.useOnlyCustomLevels;
      const childLevelComparison = options.levelComparison ?? state.levelComparison;
      const childLevels = options.customLevels !== undefined ||
          options.useOnlyCustomLevels !== undefined ||
          options.levelComparison !== undefined
        ? buildLevelRegistry({
          customLevels: childCustomLevels,
          useOnlyCustomLevels: childUseOnlyCustomLevels,
          levelComparison: childLevelComparison,
        })
        : state.levels;
      const childLevel = options.level ?? state.level;
      assertLevelConfigured(childLevel, childLevels, childUseOnlyCustomLevels);

      const childState: LoggerState = {
        ...state,
        level: childLevel,
        levelValue: childLevels.valueOf(childLevel),
        levels: childLevels,
        customLevels: childCustomLevels,
        useOnlyCustomLevels: childUseOnlyCustomLevels,
        levelComparison: childLevelComparison,
        enabled: options.enabled ?? state.enabled,
        bindings: mergeBindings(state.bindings, bindings),
        serializers: options.serializers === undefined ? state.serializers : createSerializers(
          options.serializers,
          options.errorKey ?? state.errorKey,
          state.serializers,
        ),
        redact: options.redact !== undefined ? normalizeRedact(options.redact) : state.redact,
        timestamp: options.timestamp ?? state.timestamp,
        messageKey: options.messageKey ?? state.messageKey,
        errorKey: options.errorKey ?? state.errorKey,
        nestedKey: options.nestedKey ?? state.nestedKey,
        msgPrefix: childPrefix,
        formatters: mergeFormatters(state.formatters, options.formatters),
        hooks: options.hooks ?? state.hooks,
        mixin: options.mixin ?? state.mixin,
        mixinMergeStrategy: options.mixinMergeStrategy ?? state.mixinMergeStrategy,
        lineEnding: options.crlf === true ? "\r\n" : state.lineEnding,
        encode: {
          depthLimit: options.depthLimit ?? state.encode.depthLimit,
          edgeLimit: options.edgeLimit ?? state.encode.edgeLimit,
        },
        onChild: options.onChild ?? state.onChild,
        events: new Map(),
      };
      const child = createLogger(childState);
      // Pino's `onChild` fires for every descendant; the child inherits the hook so its own
      // children fire it too.
      childState.onChild?.(child);
      return child;
    },
    bindings(): Record<string, unknown> {
      if (state.formatters.bindings !== undefined) {
        return copyBindings(formatBindings(state));
      }
      return copyBindings(state.bindings);
    },
    setBindings(bindings: Record<string, unknown>): void {
      state.bindings = mergeBindings(state.bindings, bindings);
    },
    flush(): void | Promise<void> {
      return state.backend.flush();
    },
    isLevelEnabled(level: LogLevel): boolean {
      return state.enabled && state.levels.isEnabled(state.level, level);
    },
    on(event: string, listener: EventListener): Logger {
      addEventListener(state.events, event, listener);
      return logger;
    },
    once(event: string, listener: EventListener): Logger {
      const onceListener: EventListener = (...args) => {
        logger.removeListener(event, onceListener);
        listener(...args);
      };
      addEventListener(state.events, event, onceListener);
      return logger;
    },
    addListener(event: string, listener: EventListener): Logger {
      return logger.on(event, listener);
    },
    removeListener(event: string, listener: EventListener): Logger {
      state.events.get(event)?.delete(listener);
      return logger;
    },
    emit(event: string, ...args: unknown[]): boolean {
      return emitEvent(state.events, event, args);
    },
    get level(): LogLevel {
      return state.level;
    },
    set level(level: LogLevel) {
      const previousLevel = state.level;
      const previousValue = state.levels.valueOf(previousLevel);
      const newValue = state.levels.valueOf(level);
      state.level = level;
      state.levelValue = newValue;
      if (previousLevel !== level) {
        logger.emit("level-change", level, newValue, previousLevel, previousValue, logger);
      }
    },
    get levelVal(): number {
      return state.levels.valueOf(state.level);
    },
    get levels() {
      return { values: state.levels.values, labels: state.levels.labels };
    },
    get version(): string {
      return version;
    },
    get msgPrefix(): string {
      return state.msgPrefix;
    },
    get enabled(): boolean {
      return state.enabled;
    },
    set enabled(value: boolean) {
      state.enabled = value;
    },
  };

  Object.defineProperty(logger, symbols.serializers, {
    enumerable: false,
    value: state.serializers,
  });

  if (state.useOnlyCustomLevels === true) {
    for (const name of CORE_LEVEL_NAMES) {
      delete (logger as unknown as Record<string, unknown>)[name];
    }
  }

  if (state.customLevels !== undefined) {
    const dynamic = logger as unknown as Record<string, LogMethod>;
    for (const name of Object.keys(state.customLevels)) {
      dynamic[name] = createLogMethod(state, name, state.levels.valueOf(name));
    }
  }

  return logger;
}

function createLogMethod(state: LoggerState, level: string, levelValue: number): LogMethod {
  return function logMethod(this: Logger, objOrMsg?: unknown, msg?: string, ...args: unknown[]) {
    if (!state.enabled) {
      return;
    }
    // Baked numeric gate for the common ascending comparison; fall back to the registry only for
    // DESC or custom comparators.
    if (
      state.levels.isAsc
        ? levelValue < state.levelValue
        : !state.levels.isEnabled(state.level, level)
    ) {
      return;
    }

    const rawMethod: LogMethod = (
      nextObjOrMsg?: unknown,
      nextMsg?: string,
      ...nextArgs: unknown[]
    ) => {
      const record = buildRecord(state, level, levelValue, nextObjOrMsg, nextMsg, nextArgs);
      state.backend.write(formatJsonLine(record, state.encode), levelValue);
    };

    if (state.hooks?.logMethod !== undefined) {
      state.hooks.logMethod.call(
        this,
        [objOrMsg, msg, ...args].filter(trimTrailingUndefined),
        rawMethod,
        levelValue,
      );
      return;
    }

    rawMethod(objOrMsg, msg, ...args);
  };
}

function buildRecord(
  state: LoggerState,
  level: string,
  levelValue: number,
  objOrMsg: unknown,
  msg: string | undefined,
  args: unknown[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  Object.assign(record, formatLevel(state, level, levelValue));

  const timeFields = createTimestampFields(state.timestamp);
  Object.assign(record, timeFields);
  Object.assign(record, formatBindings(state));

  let logObject = normalizeLogArguments(objOrMsg, msg, args, {
    errorKey: state.errorKey,
    messageKey: state.messageKey,
    msgPrefix: state.msgPrefix,
    nestedKey: state.nestedKey,
  });

  const mixin = state.mixin?.();
  if (mixin !== undefined) {
    logObject = state.mixinMergeStrategy === undefined
      ? { ...mixin, ...logObject }
      : state.mixinMergeStrategy(logObject, mixin);
  }

  if (state.formatters.log !== undefined) {
    logObject = state.formatters.log(logObject);
  }

  Object.assign(record, logObject);

  const withSerializers = applySerializers(record, state.serializers);
  const withErrors = serializeErrorValues(withSerializers);
  return redactRecord(withErrors, state.redact);
}

function normalizeFactoryArguments(
  optionsOrDestination: LoggerOptions | Destination,
  maybeDestination: Destination | undefined,
): { options: LoggerOptions; destination: Destination | undefined } {
  if (isWritableDestination(optionsOrDestination)) {
    return { options: {}, destination: optionsOrDestination };
  }

  const options = optionsOrDestination as LoggerOptions;
  return {
    options,
    destination: maybeDestination ?? options.destination,
  };
}

function createDefaultBaseFields(options: LoggerOptions): Record<string, unknown> {
  if (options.base === false || options.base === null) {
    return {};
  }

  if (options.base !== undefined) {
    return {};
  }

  const fields: Record<string, unknown> = { pid: Deno.pid };
  try {
    fields.hostname = Deno.hostname();
  } catch {
    // Deno may require host permissions in some environments.
  }
  return fields;
}

function createSerializers(
  serializers: Serializers | undefined,
  errorKey: string,
  parent: Serializers = {},
): Serializers {
  return {
    err: errSerializer,
    [errorKey]: errSerializer,
    ...parent,
    ...serializers,
  };
}

function mergeFormatters(
  parent: LoggerFormatters,
  child: LoggerFormatters | undefined,
): LoggerFormatters {
  return child === undefined ? parent : { ...parent, ...child };
}

function formatLevel(
  state: LoggerState,
  level: string,
  value: number,
): Record<string, unknown> {
  return state.formatters.level?.(level, value) ?? { level: value };
}

function formatBindings(state: LoggerState): Record<string, unknown> {
  const bindings = {
    ...state.baseFields,
    ...state.bindings,
  };
  return state.formatters.bindings?.(bindings) ?? bindings;
}

function createTimestampFields(option: TimestampOption | undefined): Record<string, unknown> {
  if (option === false) {
    return {};
  }

  if (typeof option === "function") {
    const value = option();
    if (typeof value === "number") {
      return { time: value };
    }
    return parseTimestampFragment(value);
  }

  return { time: Date.now() };
}

function parseTimestampFragment(fragment: string): Record<string, unknown> {
  const trimmed = fragment.trim();
  if (trimmed.length === 0) {
    return {};
  }

  const json = trimmed.startsWith(",") ? trimmed.slice(1) : trimmed;
  try {
    return JSON.parse(`{${json}}`) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function addEventListener(events: EventRegistry, event: string, listener: EventListener): void {
  const listeners = events.get(event) ?? new Set<EventListener>();
  listeners.add(listener);
  events.set(event, listeners);
}

function emitEvent(events: EventRegistry, event: string, args: unknown[]): boolean {
  const listeners = events.get(event);
  if (listeners === undefined || listeners.size === 0) {
    return false;
  }

  for (const listener of [...listeners]) {
    listener(...args);
  }
  return true;
}

function trimTrailingUndefined(value: unknown, index: number, values: unknown[]): boolean {
  if (value !== undefined) {
    return true;
  }
  return values.slice(index + 1).some((candidate) => candidate !== undefined);
}

function notImplemented(feature: string): () => never {
  return () => {
    throw new Error(
      `pequi.${feature} is not implemented. Worker transports are not part of Pequi core yet.`,
    );
  };
}

export { errSerializer, errWithCauseSerializer, stdSerializers };
