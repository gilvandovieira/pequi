/**
 * Log levels and the per-logger level registry.
 *
 * Defines the six core Pino levels plus `silent`, the numeric mapping, and
 * {@linkcode buildLevelRegistry}, which resolves custom levels and the ascending/descending
 * comparison policy used to gate log calls on the hot path.
 *
 * @module
 */

import type { CoreLogLevel, Levels, LogLevel } from "./types.ts";
import { InvalidLogLevelError, PequiError } from "./errors.ts";

/** Core level name to numeric value (`trace`=10 … `fatal`=60, `silent`=`Infinity`). */
export const levels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
} as const satisfies Record<CoreLogLevel | "silent", number>;

/** The six core level names in ascending severity order. */
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

/** The default minimum level used when none is configured. */
export const DEFAULT_LEVEL: LogLevel = "info";

/** The default {@linkcode Levels} registry exposed as `logger.levels` for the core levels. */
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

/**
 * Type guard for a known core level name (including `silent`).
 *
 * @param value Candidate level name.
 * @returns Whether `value` is a built-in level.
 */
export function isLogLevel(value: string): value is LogLevel {
  return levelNames.has(value);
}

/**
 * Assert that `value` is a known core level, throwing {@linkcode InvalidLogLevelError} otherwise.
 *
 * @param value Candidate level name.
 */
export function assertLogLevel(value: string): asserts value is LogLevel {
  if (!isLogLevel(value)) {
    throw new InvalidLogLevelError(value);
  }
}

/**
 * Resolve a core level name to its numeric value.
 *
 * @param level A core level name.
 * @returns The numeric value.
 * @throws {InvalidLogLevelError} If the name is not a core level.
 */
export function levelToNumber(level: LogLevel): number {
  const value = levels[level as keyof typeof levels];
  if (value === undefined) {
    throw new InvalidLogLevelError(level);
  }
  return value;
}

/**
 * Whether `candidateLevel` would emit given a logger set to `currentLevel` (ascending core levels).
 *
 * @param currentLevel The logger's active threshold.
 * @param candidateLevel The level being logged.
 */
export function isLevelEnabled(currentLevel: LogLevel, candidateLevel: LogLevel): boolean {
  return levelToNumber(candidateLevel) >= levelToNumber(currentLevel);
}

/** Compares the level being logged (`candidate`) against the logger's active threshold. */
export type LevelComparison = (candidate: number, active: number) => boolean;

/** Ascending comparison: a level emits when its value is at least the active threshold. */
export function ascCompare(candidate: number, active: number): boolean {
  return candidate >= active;
}

/** Descending comparison: a level emits when its value is at most the active threshold. */
export function descCompare(candidate: number, active: number): boolean {
  return candidate <= active;
}

/** The `levelComparison` option: `"ASC"`, `"DESC"`, or a custom {@linkcode LevelComparison}. */
export type LevelComparisonOption = "ASC" | "DESC" | LevelComparison;

/** Options for {@linkcode buildLevelRegistry}. */
export interface LevelRegistryOptions {
  /** Custom level name → numeric value map merged with (or replacing) the core levels. */
  customLevels?: Record<string, number>;
  /** Drop the core levels and use only `customLevels`. */
  useOnlyCustomLevels?: boolean;
  /** Level ordering policy. */
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
  /** True when the comparison is plain ascending, enabling a baked numeric gate on the hot path. */
  isAsc: boolean;
  has(name: string): boolean;
  valueOf(name: string): number;
  isEnabled(activeLevel: string, candidateLevel: string): boolean;
}

/**
 * Build a per-logger {@linkcode LevelRegistry} from custom levels and a comparison policy.
 *
 * @param options Custom levels, `useOnlyCustomLevels`, and the comparison policy.
 * @returns The resolved registry used for level lookups and hot-path gating.
 */
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
    isAsc: compare === ascCompare,
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
