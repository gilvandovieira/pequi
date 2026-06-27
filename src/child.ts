/**
 * Child-logger state construction.
 *
 * A child logger inherits its parent's bindings and configuration and layers its own bindings and
 * option overrides on top. This module computes that merged state.
 *
 * @module
 */

import { mergeBindings } from "./bindings.ts";
import type { LoggerOptions } from "./types.ts";

/** The resolved bindings and options for a child logger. */
export interface ChildLoggerState {
  /** Parent bindings merged with the child's own bindings. */
  bindings: Record<string, unknown>;
  /** Option overrides applied to the child. */
  options: LoggerOptions;
}

/**
 * Compute the {@linkcode ChildLoggerState} for a new child logger.
 *
 * @param parentBindings The parent logger's bindings.
 * @param bindings The child's additional bindings (override parent keys).
 * @param options Option overrides for the child.
 * @returns The merged child state.
 */
export function createChildState(
  parentBindings: Record<string, unknown>,
  bindings: Record<string, unknown>,
  options: LoggerOptions = {},
): ChildLoggerState {
  return {
    bindings: mergeBindings(parentBindings, bindings),
    options,
  };
}
