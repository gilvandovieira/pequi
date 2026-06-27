export interface BindingOptions {
  name?: string;
  base?: Record<string, unknown> | false | null;
}

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

export function mergeBindings(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  return { ...parent, ...child };
}

export function copyBindings(bindings: Record<string, unknown>): Record<string, unknown> {
  return { ...bindings };
}
