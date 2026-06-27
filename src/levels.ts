import type { CoreLogLevel, Levels, LogLevel } from "./types.ts";
import { InvalidLogLevelError } from "./errors.ts";

export const levels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
} as const satisfies Record<CoreLogLevel | "silent", number>;

export const DEFAULT_LEVEL: LogLevel = "info";

export const pinoLevels: Levels = {
  labels: {
    10: "trace",
    20: "debug",
    30: "info",
    40: "warn",
    50: "error",
    60: "fatal",
  },
  values: {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  },
};

const levelNames = new Set<string>(Object.keys(levels));

export function isLogLevel(value: string): value is LogLevel {
  return levelNames.has(value);
}

export function assertLogLevel(value: string): asserts value is LogLevel {
  if (!isLogLevel(value)) {
    throw new InvalidLogLevelError(value);
  }
}

export function levelToNumber(level: LogLevel): number {
  const value = levels[level as keyof typeof levels];
  if (value === undefined) {
    throw new InvalidLogLevelError(level);
  }
  return value;
}

export function isLevelEnabled(currentLevel: LogLevel, candidateLevel: LogLevel): boolean {
  return levelToNumber(candidateLevel) >= levelToNumber(currentLevel);
}
