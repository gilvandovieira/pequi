import type { CoreLogLevel, Levels, LogLevel } from "./types.ts";
import { InvalidLogLevelError, PequiError } from "./errors.ts";

export const levels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
} as const satisfies Record<CoreLogLevel | "silent", number>;

export const CORE_LEVEL_NAMES: readonly CoreLogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

const CORE_LEVEL_VALUES: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

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

/** Compares the level being logged (`candidate`) against the logger's active threshold. */
export type LevelComparison = (candidate: number, active: number) => boolean;

export function ascCompare(candidate: number, active: number): boolean {
  return candidate >= active;
}

export function descCompare(candidate: number, active: number): boolean {
  return candidate <= active;
}

export type LevelComparisonOption = "ASC" | "DESC" | LevelComparison;

export interface LevelRegistryOptions {
  customLevels?: Record<string, number>;
  useOnlyCustomLevels?: boolean;
  levelComparison?: LevelComparisonOption;
}

/**
 * Per-logger view of the active level set. Merges Pino's core levels with any `customLevels`
 * (or replaces them when `useOnlyCustomLevels` is set) and resolves the `levelComparison` policy.
 */
export interface LevelRegistry {
  /** Level name to numeric value, excluding `silent`, matching Pino's `logger.levels.values`. */
  values: Record<string, number>;
  /** Numeric value to level name, matching Pino's `logger.levels.labels`. */
  labels: Record<number, string>;
  has(name: string): boolean;
  valueOf(name: string): number;
  isEnabled(activeLevel: string, candidateLevel: string): boolean;
}

export function buildLevelRegistry(options: LevelRegistryOptions = {}): LevelRegistry {
  const base = options.useOnlyCustomLevels === true ? {} : { ...CORE_LEVEL_VALUES };
  const values: Record<string, number> = { ...base, ...options.customLevels };

  const labels: Record<number, string> = {};
  for (const [name, value] of Object.entries(values)) {
    labels[value] = name;
  }

  const compare: LevelComparison = typeof options.levelComparison === "function"
    ? options.levelComparison
    : options.levelComparison === "DESC"
    ? descCompare
    : ascCompare;

  const registry: LevelRegistry = {
    values,
    labels,
    has(name: string): boolean {
      return name === "silent" || Object.hasOwn(values, name);
    },
    valueOf(name: string): number {
      if (name === "silent") {
        return Infinity;
      }
      const value = values[name];
      if (value === undefined) {
        throw new InvalidLogLevelError(name);
      }
      return value;
    },
    isEnabled(activeLevel: string, candidateLevel: string): boolean {
      const active = registry.valueOf(activeLevel);
      if (active === Infinity) {
        return false;
      }
      return compare(registry.valueOf(candidateLevel), active);
    },
  };

  return registry;
}

/** Mirrors Pino's construction-time guard for `useOnlyCustomLevels`. */
export function assertLevelConfigured(
  level: string,
  registry: LevelRegistry,
  useOnlyCustomLevels: boolean | undefined,
): void {
  if (useOnlyCustomLevels === true && !registry.has(level)) {
    throw new PequiError(`default level:${level} must be included in custom levels`);
  }
}
