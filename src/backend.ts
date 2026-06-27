import { createPureBackend } from "./backends/pure.ts";
import { tryCreateNativeBackend } from "./backends/native.ts";
import type { Backend, Destination, NativeMode } from "./types.ts";

export interface CreateBackendOptions {
  native?: NativeMode;
  destination?: Destination;
  lineEnding?: "\n" | "\r\n";
}

export function createBackend(options: CreateBackendOptions = {}): Backend {
  const nativeMode = options.native ?? false;
  if (nativeMode === false) {
    return createPureBackend({
      destination: options.destination,
      lineEnding: options.lineEnding,
    });
  }

  const nativeBackend = tryCreateNativeBackend({
    mode: nativeMode,
    destination: options.destination,
    lineEnding: options.lineEnding,
  });

  if (nativeBackend !== undefined) {
    return nativeBackend;
  }

  return createPureBackend({
    destination: options.destination,
    lineEnding: options.lineEnding,
  });
}
