import { isConfiguredDestination } from "../destination.ts";
import { NativeBackendUnavailable } from "../errors.ts";
import type { Backend, Destination, NativeMode } from "../types.ts";

export const NATIVE_ABI_VERSION = 1;

const supportedTargets = {
  "linux-x86_64": "linux-x86_64-gnu",
  "linux-aarch64": "linux-aarch64-gnu",
} as const;

const rustTargetTriples = {
  "linux-x86_64": "x86_64-unknown-linux-gnu",
  "linux-aarch64": "aarch64-unknown-linux-gnu",
} as const;

export const nativeSymbols = {
  pequi_abi_version: { parameters: [], result: "u32" },
  pequi_init: {
    parameters: ["u8", "buffer", "usize", "usize"],
    result: "pointer",
  },
  pequi_write: { parameters: ["pointer", "buffer", "usize"], result: "i32" },
  pequi_flush: { parameters: ["pointer"], result: "i32" },
  pequi_last_error: {
    parameters: ["pointer", "buffer", "usize"],
    result: "usize",
  },
  pequi_last_error_global: { parameters: ["buffer", "usize"], result: "usize" },
  pequi_drop: { parameters: ["pointer"], result: "void" },
} as const satisfies Deno.ForeignLibraryInterface;

export type NativeLibrary = Deno.DynamicLibrary<typeof nativeSymbols>;
type NativeHandle = Deno.PointerValue;

export interface NativeBackendOptions {
  mode?: Exclude<NativeMode, false>;
  destination?: Destination;
  lineEnding?: "\n" | "\r\n";
  bufferSize?: number;
  libraryPath?: string;
}

export interface NativeLoadInfo {
  os: typeof Deno.build.os;
  arch: typeof Deno.build.arch;
  target: string | undefined;
  attemptedLibraryPaths: string[];
}

export interface LoadedNativeLibrary extends NativeLoadInfo {
  library: NativeLibrary;
  libraryPath: string;
  abiVersion: number;
}

interface NativeDestination {
  kind: 0 | 1 | 2 | 3;
  pathBytes: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const emptyBuffer = new Uint8Array(0);

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

  return urlPath(new URL(`../../prebuilt/${target}/libpequi_log.so`, import.meta.url));
}

export function resolveNativeLibraryCandidates(libraryPath?: string): string[] {
  if (libraryPath !== undefined) {
    return [libraryPath];
  }

  const prebuiltPath = resolveNativeLibraryPath();
  if (prebuiltPath === undefined) {
    return [];
  }

  const candidates = [
    prebuiltPath,
    urlPath(new URL("../../native/rust/target/release/libpequi_log.so", import.meta.url)),
  ];

  const rustTriple = resolveRustTargetTriple();
  if (rustTriple !== undefined) {
    candidates.push(
      urlPath(
        new URL(
          `../../native/rust/target/${rustTriple}/release/libpequi_log.so`,
          import.meta.url,
        ),
      ),
    );
  }

  return [...new Set(candidates)];
}

export function getNativeLoadInfo(libraryPath?: string): NativeLoadInfo {
  return {
    os: Deno.build.os,
    arch: Deno.build.arch,
    target: resolveNativeTarget(),
    attemptedLibraryPaths: resolveNativeLibraryCandidates(libraryPath),
  };
}

export function loadNativeLibrary(libraryPath?: string): LoadedNativeLibrary {
  const loadInfo = getNativeLoadInfo(libraryPath);
  const failures: string[] = [];
  let lastCause: Error | undefined;

  if (loadInfo.attemptedLibraryPaths.length === 0) {
    throw nativeStartupError(
      `No native backend target is available for ${Deno.build.os}/${Deno.build.arch}.`,
      loadInfo,
    );
  }

  for (const attemptedPath of loadInfo.attemptedLibraryPaths) {
    let library: NativeLibrary;
    try {
      library = Deno.dlopen(attemptedPath, nativeSymbols);
    } catch (cause) {
      lastCause = cause instanceof Error ? cause : undefined;
      failures.push(`${attemptedPath}: ${errorMessage(cause)}`);
      continue;
    }

    let abiVersion: number;
    try {
      abiVersion = Number(library.symbols.pequi_abi_version());
    } catch (cause) {
      library.close();
      lastCause = cause instanceof Error ? cause : undefined;
      failures.push(`${attemptedPath}: failed to read ABI version: ${errorMessage(cause)}`);
      continue;
    }

    if (abiVersion !== NATIVE_ABI_VERSION) {
      library.close();
      failures.push(
        `${attemptedPath}: native ABI version mismatch: expected ${NATIVE_ABI_VERSION}, ` +
          `got ${abiVersion}`,
      );
      continue;
    }

    return {
      ...loadInfo,
      library,
      libraryPath: attemptedPath,
      abiVersion,
    };
  }

  throw nativeStartupError(
    `Unable to load native backend.\nFailures:\n${failures.join("\n")}`,
    loadInfo,
    lastCause,
  );
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
  const loadInfo = getNativeLoadInfo(options.libraryPath);
  const destination = resolveNativeDestination(options.destination, loadInfo);
  const bufferSize = normalizeBufferSize(options.bufferSize, loadInfo);
  const loaded = loadNativeLibrary(options.libraryPath);

  let handle: NativeHandle;
  try {
    handle = loaded.library.symbols.pequi_init(
      destination.kind,
      destination.pathBytes,
      BigInt(destination.pathBytes.byteLength),
      BigInt(bufferSize),
    );
  } catch (cause) {
    loaded.library.close();
    throw nativeStartupError(
      `Native backend initialization failed before returning a handle: ${errorMessage(cause)}`,
      loaded,
      cause instanceof Error ? cause : undefined,
    );
  }

  if (handle === null) {
    const nativeError = readGlobalLastError(loaded.library);
    loaded.library.close();
    throw nativeStartupError(
      `Native backend initialization failed: ${nativeError}`,
      loaded,
    );
  }

  return new NativeBackend(
    loaded.library,
    handle,
    options.lineEnding ?? "\n",
  );
}

function resolveNativeDestination(
  destination: Destination | undefined,
  loadInfo: NativeLoadInfo,
): NativeDestination {
  if (destination === undefined) {
    return { kind: 1, pathBytes: emptyBuffer };
  }

  if (!isConfiguredDestination(destination)) {
    throw nativeStartupError(
      "The native backend supports configured destinations only; custom writable " +
        "destinations use the pure TypeScript backend.",
      loadInfo,
    );
  }

  switch (destination.type) {
    case "discard":
      return { kind: 0, pathBytes: emptyBuffer };
    case "stdout":
      return { kind: 1, pathBytes: emptyBuffer };
    case "stderr":
      return { kind: 2, pathBytes: emptyBuffer };
    case "file":
      return { kind: 3, pathBytes: encoder.encode(destination.path) };
    case "memory":
      throw nativeStartupError(
        "The native backend does not support the memory destination; use native: false " +
          "or native: auto fallback for memory capture.",
        loadInfo,
      );
  }
}

function normalizeBufferSize(
  bufferSize: number | undefined,
  loadInfo: NativeLoadInfo,
): number {
  if (bufferSize === undefined) {
    return 0;
  }

  if (!Number.isSafeInteger(bufferSize) || bufferSize < 0) {
    throw nativeStartupError(
      `Invalid native buffer size: ${bufferSize}. Expected a non-negative safe integer.`,
      loadInfo,
    );
  }

  return bufferSize;
}

class NativeBackend implements Backend {
  readonly #library: NativeLibrary;
  readonly #handle: NativeHandle;
  readonly #lineEnding: "\n" | "\r\n";
  #closed = false;

  constructor(
    library: NativeLibrary,
    handle: NativeHandle,
    lineEnding: "\n" | "\r\n",
  ) {
    this.#library = library;
    this.#handle = handle;
    this.#lineEnding = lineEnding;
  }

  write(line: string): void {
    this.#assertOpen();
    const bytes = encoder.encode(`${line}${this.#lineEnding}`);
    const code = this.#library.symbols.pequi_write(
      this.#handle,
      bytes,
      BigInt(bytes.byteLength),
    );
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

    this.#closed = true;
    try {
      this.#library.symbols.pequi_drop(this.#handle);
    } finally {
      this.#library.close();
    }
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
      `Native backend ${operation} failed with status ${code} (${nativeStatusName(code)}): ` +
        this.#lastErrorMessage(),
    );
  }

  #lastErrorMessage(): string {
    return readHandleLastError(this.#library, this.#handle);
  }
}

function readHandleLastError(library: NativeLibrary, handle: NativeHandle): string {
  const length = Number(library.symbols.pequi_last_error(handle, emptyBuffer, 0n));
  if (length <= 0) {
    return "unknown native error";
  }

  const buffer = new Uint8Array(length);
  const reportedLength = Number(
    library.symbols.pequi_last_error(handle, buffer, BigInt(buffer.byteLength)),
  );
  return decoder.decode(buffer.subarray(0, Math.min(reportedLength || length, buffer.byteLength)));
}

function readGlobalLastError(library: NativeLibrary): string {
  const length = Number(library.symbols.pequi_last_error_global(emptyBuffer, 0n));
  if (length <= 0) {
    return "unknown native initialization error";
  }

  const buffer = new Uint8Array(length);
  const reportedLength = Number(
    library.symbols.pequi_last_error_global(buffer, BigInt(buffer.byteLength)),
  );
  return decoder.decode(buffer.subarray(0, Math.min(reportedLength || length, buffer.byteLength)));
}

function resolveRustTargetTriple(): string | undefined {
  if (Deno.build.os !== "linux") {
    return undefined;
  }

  const key = `${Deno.build.os}-${Deno.build.arch}`;
  return rustTargetTriples[key as keyof typeof rustTargetTriples];
}

function nativeStartupError(
  message: string,
  loadInfo: NativeLoadInfo,
  cause?: Error,
): NativeBackendUnavailable {
  const attemptedLibraryPath = loadInfo.attemptedLibraryPaths.length === 0
    ? "none"
    : loadInfo.attemptedLibraryPaths.join(", ");

  return new NativeBackendUnavailable(
    [
      message,
      `operating system: ${loadInfo.os}`,
      `architecture: ${loadInfo.arch}`,
      `attempted library path: ${attemptedLibraryPath}`,
      "--allow-ffi may be missing: Deno FFI requires --allow-ffi to load native libraries.",
    ].join("\n"),
    { cause },
  );
}

function nativeStatusName(code: number): string {
  switch (code) {
    case 1:
      return "null handle";
    case 2:
      return "null bytes pointer";
    case 3:
      return "invalid UTF-8";
    case 4:
      return "I/O error";
    case 5:
      return "panic caught";
    case 6:
      return "invalid destination";
    case 7:
      return "invalid path";
    case 255:
      return "unknown error";
    default:
      return "unrecognized error";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function urlPath(url: URL): string {
  return url.pathname;
}
