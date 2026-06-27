/**
 * Logger binding helpers.
 *
 * Bindings are the fixed key/value pairs merged into every log line a logger emits. This module
 * builds the base bindings and merges parent bindings with child bindings for child loggers.
 *
 * @module
 */

/** Options for {@linkcode createBaseBindings}. */
export interface BindingOptions {
  /** Adds a `name` field to the base bindings. */
  name?: string;
  /** Base object to seed bindings; `false`/`null` produces no base fields. */
  base?: Record<string, unknown> | false | null;
}

/**
 * Build the base bindings for a root logger from its `base` and `name` options.
 *
 * @param options Name and base configuration.
 * @returns A new bindings object.
 */
export function createBaseBindings(options: BindingOptions = {}): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};

  if (options.base !== false && options.base !== null && options.base !== undefined) {
    Object.assign(bindings, options.base);
  }

  if (options.name !== undefined) {
    bindings.name = options.name;
  }

  return bindings;
}

/**
 * Merge parent bindings with child bindings; child keys win on conflict.
 *
 * @param parent The parent logger's bindings.
 * @param child The child logger's additional bindings.
 * @returns A new merged bindings object.
 */
export function mergeBindings(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  return { ...parent, ...child };
}

/**
 * Return a shallow copy of a bindings object, so callers cannot mutate a logger's internal state.
 *
 * @param bindings The bindings to copy.
 * @returns A new object with the same keys and values.
 */
export function copyBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  return { ...bindings };
}
