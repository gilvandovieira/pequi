import { NativeBackendUnavailable } from "../errors.ts";
import { isConfiguredDestination } from "../destination.ts";
import type { Backend, Destination, NativeMode } from "../types.ts";

const supportedTargets = {
  "linux-x86_64": "linux-x86_64-gnu",
  "linux-aarch64": "linux-aarch64-gnu",
} as const;

const nativeSymbols = {
  pequi_init: { parameters: [], result: "pointer" },
  pequi_write: { parameters: ["pointer", "buffer", "usize"], result: "i32" },
  pequi_flush: { parameters: ["pointer"], result: "i32" },
  pequi_last_error: { parameters: ["pointer", "buffer", "usize"], result: "usize" },
  pequi_drop: { parameters: ["pointer"], result: "void" },
} as const satisfies Deno.ForeignLibraryInterface;

type NativeLibrary = Deno.DynamicLibrary<typeof nativeSymbols>;
type NativeHandle = Deno.PointerValue;

export interface NativeBackendOptions {
  mode?: Exclude<NativeMode, false>;
  destination?: Destination;
}

export function isNativePlatformSupported(): boolean {
  return resolveNativeTarget() !== undefined;
}

export function resolveNativeTarget(): string | undefined {
  if (Deno.build.os !== "linux") {
    return undefined;
  }

  const key = `${Deno.build.os}-${Deno.build.arch}`;
  return supportedTargets[key as keyof typeof supportedTargets];
}

export function resolveNativeLibraryPath(): string | undefined {
  const target = resolveNativeTarget();
  if (target === undefined) {
    return undefined;
  }

  const url = new URL(`../../prebuilt/${target}/libpequi_native.so`, import.meta.url);
  return url.pathname;
}

export function tryCreateNativeBackend(options: NativeBackendOptions = {}): Backend | undefined {
  const mode = options.mode ?? "auto";
  try {
    return createNativeBackend({ ...options, mode });
  } catch (error) {
    if (mode === "required") {
      throw error;
    }
    return undefined;
  }
}

export function createNativeBackend(options: NativeBackendOptions = {}): Backend {
  const destination = options.destination;
  if (
    destination !== undefined &&
    (!isConfiguredDestination(destination) || destination.type !== "stdout")
  ) {
    throw new NativeBackendUnavailable(
      "The native backend currently supports only the stdout destination.",
    );
  }

  const libraryPath = resolveNativeLibraryPath();
  if (libraryPath === undefined) {
    throw new NativeBackendUnavailable(
      `No native backend target is available for ${Deno.build.os}/${Deno.build.arch}.`,
    );
  }

  assertReadableLibrary(libraryPath);

  let library: NativeLibrary;
  try {
    library = Deno.dlopen(libraryPath, nativeSymbols);
  } catch (cause) {
    throw new NativeBackendUnavailable(
      `Unable to load native backend at ${libraryPath}. Deno FFI requires --allow-ffi.`,
      { cause: cause instanceof Error ? cause : undefined },
    );
  }

  const handle = library.symbols.pequi_init();
  if (handle === null) {
    library.close();
    throw new NativeBackendUnavailable("Native backend initialization returned a null handle.");
  }

  return new NativeBackend(library, handle);
}

function assertReadableLibrary(path: string): void {
  try {
    Deno.statSync(path);
  } catch (cause) {
    throw new NativeBackendUnavailable(
      `Native backend library was not found at ${path}. Run deno task native:build first.`,
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
}

class NativeBackend implements Backend {
  readonly #library: NativeLibrary;
  readonly #handle: NativeHandle;
  readonly #encoder = new TextEncoder();
  readonly #decoder = new TextDecoder();
  #closed = false;

  constructor(library: NativeLibrary, handle: NativeHandle) {
    this.#library = library;
    this.#handle = handle;
  }

  write(line: string): void {
    this.#assertOpen();
    const bytes = this.#encoder.encode(`${line}\n`);
    const code = this.#library.symbols.pequi_write(this.#handle, bytes, BigInt(bytes.byteLength));
    this.#assertNativeOk(code, "write");
  }

  flush(): void {
    this.#assertOpen();
    const code = this.#library.symbols.pequi_flush(this.#handle);
    this.#assertNativeOk(code, "flush");
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#library.symbols.pequi_drop(this.#handle);
    this.#library.close();
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new NativeBackendUnavailable("Native backend is already closed.");
    }
  }

  #assertNativeOk(code: number, operation: string): void {
    if (code === 0) {
      return;
    }

    throw new NativeBackendUnavailable(
      `Native backend ${operation} failed: ${this.#lastErrorMessage()}`,
    );
  }

  #lastErrorMessage(): string {
    const empty = new Uint8Array(0);
    const length = Number(this.#library.symbols.pequi_last_error(this.#handle, empty, 0n));
    if (length <= 0) {
      return "unknown native error";
    }

    const buffer = new Uint8Array(length);
    const copied = Number(
      this.#library.symbols.pequi_last_error(this.#handle, buffer, BigInt(buffer.byteLength)),
    );
    return this.#decoder.decode(buffer.subarray(0, copied || length));
  }
}
