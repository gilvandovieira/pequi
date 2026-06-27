import { mergeBindings } from "./bindings.ts";
import type { LoggerOptions } from "./types.ts";

export interface ChildLoggerState {
  bindings: Record<string, unknown>;
  options: LoggerOptions;
}

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
