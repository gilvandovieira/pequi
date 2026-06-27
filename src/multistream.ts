/**
 * Multi-destination fan-out.
 *
 * {@linkcode multistream} mirrors `pino.multistream`: it routes one logger's output to several
 * destinations, each filtered by its own level, with optional `dedupe` to send each line to a
 * single stream.
 *
 * @module
 */

import { levelToNumber } from "./levels.ts";
import { isWritableDestination } from "./destination.ts";
import type { LogLevel, WritableDestination } from "./types.ts";

/** One destination in a {@linkcode multistream}, with its own minimum level. */
export interface MultistreamEntry {
  /** Minimum level for this stream; defaults to the multistream's default level. */
  level?: LogLevel | number;
  /** The destination sink. */
  stream: WritableDestination;
}

/** Options for {@linkcode multistream}. */
export interface MultistreamOptions {
  /** Default level for entries that do not specify one. Defaults to `"info"`. */
  level?: LogLevel | number;
  /** Route each line to a single stream (the highest level at or below the line's level). */
  dedupe?: boolean;
}

interface ResolvedStream {
  level: number;
  stream: WritableDestination;
}

/** The destination returned by {@linkcode multistream}; pass it as a logger's `destination`. */
export interface MultiStreamDestination extends WritableDestination {
  /** Set by the logger before each write so the multistream knows the line's level. */
  lastLevel: number;
  /** Add another stream after construction; returns `this` for chaining. */
  add(entry: MultistreamEntry | WritableDestination): MultiStreamDestination;
  /** The resolved streams and their levels. */
  readonly streams: ResolvedStream[];
}

const INFO = levelToNumber("info");

function resolveLevel(level: LogLevel | number | undefined, fallback: number): number {
  if (level === undefined) {
    return fallback;
  }
  return typeof level === "number" ? level : levelToNumber(level);
}

/**
 * Fans a single logger's output out to several destinations, each filtered by its own level. Mirrors
 * `pino.multistream`: pass the result as the destination, and the logger sets `lastLevel` before each
 * write so the lines can be routed.
 */
export function multistream(
  streams:
    | MultistreamEntry
    | WritableDestination
    | Array<MultistreamEntry | WritableDestination>,
  options: MultistreamOptions = {},
): MultiStreamDestination {
  const defaultLevel = resolveLevel(options.level, INFO);
  const dedupe = options.dedupe === true;
  const resolved: ResolvedStream[] = [];

  const result: MultiStreamDestination = {
    lastLevel: defaultLevel,
    streams: resolved,
    add(entry): MultiStreamDestination {
      resolved.push(toResolved(entry, defaultLevel));
      return result;
    },
    write(chunk: string): boolean {
      const level = result.lastLevel;
      if (dedupe) {
        writeDeduped(resolved, level, chunk);
      } else {
        for (const entry of resolved) {
          if (level >= entry.level) {
            entry.stream.write(chunk);
          }
        }
      }
      return true;
    },
    flush(): void {
      for (const entry of resolved) {
        entry.stream.flush?.();
      }
    },
    end(): void {
      for (const entry of resolved) {
        entry.stream.end?.();
      }
    },
  };

  for (const entry of Array.isArray(streams) ? streams : [streams]) {
    result.add(entry);
  }

  return result;
}

function toResolved(
  entry: MultistreamEntry | WritableDestination,
  defaultLevel: number,
): ResolvedStream {
  if (isWritableDestination(entry)) {
    return { level: defaultLevel, stream: entry };
  }
  return { level: resolveLevel(entry.level, defaultLevel), stream: entry.stream };
}

function writeDeduped(streams: ResolvedStream[], level: number, chunk: string): void {
  if (streams.length === 0) {
    return;
  }
  // Highest stream level at or below the line's level; if the line is below all, use the lowest.
  let target = -Infinity;
  for (const entry of streams) {
    if (entry.level <= level && entry.level > target) {
      target = entry.level;
    }
  }
  if (target === -Infinity) {
    target = Math.min(...streams.map((entry) => entry.level));
  }
  for (const entry of streams) {
    if (entry.level === target) {
      entry.stream.write(chunk);
    }
  }
}
