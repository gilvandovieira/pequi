import { createBackend } from "./backend.ts";
import { copyBindings, createBaseBindings, mergeBindings } from "./bindings.ts";
import { destination as createDestination, isWritableDestination } from "./destination.ts";
import type { EncodeOptions } from "./encode.ts";
import { formatJsonLine, normalizeLogArguments } from "./format.ts";
import { DEFAULT_LEVEL, isLevelEnabled, levels, levelToNumber, pinoLevels } from "./levels.ts";
import { redactRecord } from "./redaction.ts";
import {
  applySerializers,
  errSerializer,
  errWithCauseSerializer,
  serializeErrorValues,
  stdSerializers,
} from "./serializers.ts";
import type {
  Backend,
  CoreLogLevel,
  Destination,
  Logger,
  LoggerFormatters,
  LoggerOptions,
  LogLevel,
  LogMethod,
  MixinMergeStrategy,
  RedactConfig,
  Serializers,
  TimestampOption,
} from "./types.ts";

export const version = "0.1.0";

export interface PequiSymbols {
  serializers: symbol;
  serializersSym: symbol;
}

export interface PequiStdTimeFunctions {
  epochTime(): string;
  isoTime(): string;
}

export const symbols: PequiSymbols = {
  serializers: Symbol.for("pino.serializers"),
  serializersSym: Symbol.for("pino.serializers"),
};

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
  enabled: boolean;
  baseFields: Record<string, unknown>;
  bindings: Record<string, unknown>;
  serializers: Serializers;
  redact?: RedactConfig;
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
  events: EventRegistry;
}

type EventListener = (...args: unknown[]) => void;
type EventRegistry = Map<string, Set<EventListener>>;

export interface PequiFactory {
  (options?: LoggerOptions): Logger;
  (destination: Destination): Logger;
  (options: LoggerOptions, destination: Destination): Logger;
  destination: typeof createDestination;
  transport: () => never;
  multistream: () => never;
  stdSerializers: typeof stdSerializers;
  stdTimeFunctions: typeof stdTimeFunctions;
  symbols: typeof symbols;
  version: string;
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
  const lineEnding = options.crlf === true ? "\r\n" : "\n";
  const backend = createBackend({
    native: options.native,
    destination,
    lineEnding,
  });

  return createLogger({
    backend,
    level: options.level ?? DEFAULT_LEVEL,
    enabled: options.enabled ?? true,
    baseFields: createDefaultBaseFields(options),
    bindings: createBaseBindings({
      name: options.name,
      base: options.base,
    }),
    serializers: createSerializers(options.serializers, options.errorKey ?? "err"),
    redact: options.redact,
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
    events: new Map(),
  });
}

export const pequi = Object.assign(pequiFactory, {
  destination: createDestination,
  transport: notImplemented("transport"),
  multistream: notImplemented("multistream"),
  stdSerializers,
  stdTimeFunctions,
  symbols,
  version,
  levels: pinoLevels,
}) as PequiFactory;

export const pino = pequi;

function createLogger(state: LoggerState): Logger {
  const logger: Logger = {
    trace: createLogMethod(state, "trace"),
    debug: createLogMethod(state, "debug"),
    info: createLogMethod(state, "info"),
    warn: createLogMethod(state, "warn"),
    error: createLogMethod(state, "error"),
    fatal: createLogMethod(state, "fatal"),
    silent: () => {},
    child(bindings: Record<string, unknown>, options: LoggerOptions = {}): Logger {
      const childPrefix = options.msgPrefix === undefined
        ? state.msgPrefix
        : `${state.msgPrefix}${options.msgPrefix}`;
      const childState: LoggerState = {
        ...state,
        level: options.level ?? state.level,
        enabled: options.enabled ?? state.enabled,
        bindings: mergeBindings(state.bindings, bindings),
        serializers: options.serializers === undefined ? state.serializers : createSerializers(
          options.serializers,
          options.errorKey ?? state.errorKey,
          state.serializers,
        ),
        redact: options.redact ?? state.redact,
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
        events: new Map(),
      };
      const child = createLogger(childState);
      options.onChild?.(child);
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
      return state.enabled && isLevelEnabled(state.level, level);
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
      const previousValue = levelToNumber(previousLevel);
      const newValue = levelToNumber(level);
      state.level = level;
      if (previousLevel !== level) {
        logger.emit("level-change", level, newValue, previousLevel, previousValue, logger);
      }
    },
    get levelVal(): number {
      return levelToNumber(state.level);
    },
    get levels() {
      return pinoLevels;
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

  return logger;
}

function createLogMethod(state: LoggerState, level: CoreLogLevel): LogMethod {
  return function logMethod(this: Logger, objOrMsg?: unknown, msg?: string, ...args: unknown[]) {
    if (!state.enabled || !isLevelEnabled(state.level, level)) {
      return;
    }

    const rawMethod: LogMethod = (
      nextObjOrMsg?: unknown,
      nextMsg?: string,
      ...nextArgs: unknown[]
    ) => {
      const record = buildRecord(state, level, nextObjOrMsg, nextMsg, nextArgs);
      state.backend.write(formatJsonLine(record, state.encode));
    };

    if (state.hooks?.logMethod !== undefined) {
      state.hooks.logMethod.call(
        this,
        [objOrMsg, msg, ...args].filter(trimTrailingUndefined),
        rawMethod,
        levels[level],
      );
      return;
    }

    rawMethod(objOrMsg, msg, ...args);
  };
}

function buildRecord(
  state: LoggerState,
  level: CoreLogLevel,
  objOrMsg: unknown,
  msg: string | undefined,
  args: unknown[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  Object.assign(record, formatLevel(state, level));

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

function formatLevel(state: LoggerState, level: CoreLogLevel): Record<string, unknown> {
  const value = levels[level];
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
