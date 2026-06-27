export type CoreLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogLevel = CoreLogLevel | "silent" | string;

export type NativeMode = false | "auto" | "required";

export type DestinationType = "stdout" | "stderr" | "file" | "memory" | "discard";

export interface WritableDestination {
  write(chunk: string): void | boolean;
  flush?(): void | Promise<void>;
  end?(): void | Promise<void>;
}

export interface StdoutDestination {
  type: "stdout";
}

export interface StderrDestination {
  type: "stderr";
}

export interface FileDestination {
  type: "file";
  path: string;
  append?: boolean;
}

export interface MemoryDestination {
  type: "memory";
  lines: string[];
}

export interface DiscardDestination {
  type: "discard";
}

export type ConfiguredDestination =
  | StdoutDestination
  | StderrDestination
  | FileDestination
  | MemoryDestination
  | DiscardDestination;

export type Destination = ConfiguredDestination | WritableDestination;

export type Serializer = (value: unknown) => unknown;

export type Serializers = Record<string, Serializer>;

export interface RedactOptions {
  paths: string[];
  censor?: string | ((value: unknown, path: string) => unknown);
  remove?: boolean;
}

export type RedactConfig = false | string[] | RedactOptions;

export type TimestampOption = boolean | (() => string | number);

export interface LevelFormatter {
  (label: string, number: number): Record<string, unknown>;
}

export interface BindingsFormatter {
  (bindings: Record<string, unknown>): Record<string, unknown>;
}

export interface LogFormatter {
  (object: Record<string, unknown>): Record<string, unknown>;
}

export interface LoggerFormatters {
  level?: LevelFormatter;
  bindings?: BindingsFormatter;
  log?: LogFormatter;
}

export type MixinMergeStrategy = (
  mergeObject: Record<string, unknown>,
  mixinObject: Record<string, unknown>,
) => Record<string, unknown>;

export interface LogMethodHook {
  (this: Logger, args: unknown[], method: LogMethod, level: number): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  base?: Record<string, unknown> | false | null;
  enabled?: boolean;
  serializers?: Serializers;
  redact?: RedactConfig;
  native?: NativeMode;
  destination?: Destination;
  timestamp?: TimestampOption;
  messageKey?: string;
  errorKey?: string;
  nestedKey?: string;
  msgPrefix?: string;
  formatters?: LoggerFormatters;
  hooks?: {
    logMethod?: LogMethodHook;
  };
  mixin?: () => Record<string, unknown>;
  mixinMergeStrategy?: MixinMergeStrategy;
  crlf?: boolean;
  customLevels?: Record<string, number>;
  useOnlyCustomLevels?: boolean;
  levelComparison?: "ASC" | "DESC" | ((current: number, expected: number) => boolean);
  transport?: unknown;
  browser?: unknown;
  onChild?: (child: Logger) => void;
  safe?: boolean;
  depthLimit?: number;
  edgeLimit?: number;
}

export interface Backend {
  write(line: string): void;
  flush(): void | Promise<void>;
  close(): void | Promise<void>;
}

export type LogMethod = (objOrMsg?: unknown, msg?: string, ...args: unknown[]) => void;

export interface Logger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  silent: LogMethod;
  child(bindings: Record<string, unknown>, options?: LoggerOptions): Logger;
  bindings(): Record<string, unknown>;
  setBindings(bindings: Record<string, unknown>): void;
  flush(): void | Promise<void>;
  isLevelEnabled(level: LogLevel): boolean;
  on(event: string, listener: (...args: unknown[]) => void): Logger;
  once(event: string, listener: (...args: unknown[]) => void): Logger;
  addListener(event: string, listener: (...args: unknown[]) => void): Logger;
  removeListener(event: string, listener: (...args: unknown[]) => void): Logger;
  emit(event: string, ...args: unknown[]): boolean;
  level: LogLevel;
  readonly levelVal: number;
  readonly levels: Levels;
  readonly version: string;
  readonly msgPrefix: string;
  enabled: boolean;
}

export interface Levels {
  labels: Record<number, string>;
  values: Record<string, number>;
}
