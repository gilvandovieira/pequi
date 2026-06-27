import { isConfiguredDestination } from "../destination.ts";
import { NativeBackendUnavailable, PequiNativeError } from "../errors.ts";
import type { Backend, Destination, NativeDiagnostics, NativeMode } from "../types.ts";

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

export interface NativeBackendCreation {
  backend: Backend;
  diagnostics: NativeDiagnostics;
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

export function loadNativeLibrary(
  libraryPath?: string,
  requestedMode: NativeMode = "required",
): LoadedNativeLibrary {
  const loadInfo = getNativeLoadInfo(libraryPath);
  const failures: string[] = [];
  let lastCause: Error | undefined;
  let dlopenFailed = false;
  let abiVersionFound: number | undefined;

  if (loadInfo.attemptedLibraryPaths.length === 0) {
    throw nativeStartupError(
      `No native backend target is available for ${Deno.build.os}/${Deno.build.arch}.`,
      loadInfo,
      requestedMode,
    );
  }

  for (const attemptedPath of loadInfo.attemptedLibraryPaths) {
    let library: NativeLibrary;
    try {
      library = Deno.dlopen(attemptedPath, nativeSymbols);
    } catch (cause) {
      dlopenFailed = true;
      lastCause = cause instanceof Error ? cause : undefined;
      failures.push(`${attemptedPath}: ${errorMessage(cause)}`);
      continue;
    }

    let abiVersion: number;
    try {
      abiVersion = Number(library.symbols.pequi_abi_version());
      abiVersionFound = abiVersion;
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
    requestedMode,
    lastCause,
    {
      abiVersionFound,
      dlopenFailed,
      nativeErrorMessage: failures.join("\n"),
    },
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
  return createNativeBackendResult(options).backend;
}

export function createNativeBackendResult(
  options: NativeBackendOptions = {},
): NativeBackendCreation {
  const requestedMode = options.mode ?? "required";
  const loadInfo = getNativeLoadInfo(options.libraryPath);
  const destination = resolveNativeDestination(options.destination, loadInfo, requestedMode);
  const bufferSize = normalizeBufferSize(options.bufferSize, loadInfo, requestedMode);
  const loaded = loadNativeLibrary(options.libraryPath, requestedMode);

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
      requestedMode,
      cause instanceof Error ? cause : undefined,
      {
        abiVersionFound: loaded.abiVersion,
        initFailed: true,
        nativeErrorMessage: errorMessage(cause),
      },
    );
  }

  if (handle === null) {
    const nativeError = readGlobalLastError(loaded.library);
    loaded.library.close();
    throw nativeStartupError(
      `Native backend initialization failed: ${nativeError}`,
      loaded,
      requestedMode,
      undefined,
      {
        abiVersionFound: loaded.abiVersion,
        initFailed: true,
        nativeErrorMessage: nativeError,
      },
    );
  }

  const diagnostics = createNativeDiagnostics(loaded, requestedMode, {
    selectedBackend: "native",
    abiVersionFound: loaded.abiVersion,
  });

  return {
    backend: new NativeBackend(
      loaded.library,
      handle,
      options.lineEnding ?? "\n",
      destination.kind,
      loaded.libraryPath,
      diagnostics,
    ),
    diagnostics,
  };
}

export function isNativeBackend(backend: Backend): boolean {
  return backend instanceof NativeBackend;
}

function resolveNativeDestination(
  destination: Destination | undefined,
  loadInfo: NativeLoadInfo,
  requestedMode: NativeMode,
): NativeDestination {
  if (destination === undefined) {
    return { kind: 1, pathBytes: emptyBuffer };
  }

  if (!isConfiguredDestination(destination)) {
    throw nativeStartupError(
      "The native backend supports configured destinations only; custom writable " +
        "destinations use the pure TypeScript backend.",
      loadInfo,
      requestedMode,
      undefined,
      {
        nativeErrorMessage: "custom writable destination is not supported by native",
      },
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
        requestedMode,
        undefined,
        { nativeErrorMessage: "memory destination is not supported by native" },
      );
  }
}

function normalizeBufferSize(
  bufferSize: number | undefined,
  loadInfo: NativeLoadInfo,
  requestedMode: NativeMode,
): number {
  if (bufferSize === undefined) {
    return 0;
  }

  if (!Number.isSafeInteger(bufferSize) || bufferSize < 0) {
    throw nativeStartupError(
      `Invalid native buffer size: ${bufferSize}. Expected a non-negative safe integer.`,
      loadInfo,
      requestedMode,
      undefined,
      { nativeErrorMessage: "invalid native buffer size" },
    );
  }

  return bufferSize;
}

export class NativeBackend implements Backend {
  readonly #library: NativeLibrary;
  readonly #handle: NativeHandle;
  readonly #lineEnding: "\n" | "\r\n";
  readonly #destinationKind: number;
  readonly #libraryPath: string;
  readonly #diagnostics: NativeDiagnostics;
  #closed = false;

  constructor(
    library: NativeLibrary,
    handle: NativeHandle,
    lineEnding: "\n" | "\r\n",
    destinationKind: number,
    libraryPath: string,
    diagnostics: NativeDiagnostics,
  ) {
    this.#library = library;
    this.#handle = handle;
    this.#lineEnding = lineEnding;
    this.#destinationKind = destinationKind;
    this.#libraryPath = libraryPath;
    this.#diagnostics = diagnostics;
  }

  get diagnostics(): NativeDiagnostics {
    return this.#diagnostics;
  }

  get destinationKind(): number {
    return this.#destinationKind;
  }

  write(line: string): void {
    this.#assertOpen("write");
    const bytes = encoder.encode(`${line}${this.#lineEnding}`);
    const code = this.#library.symbols.pequi_write(
      this.#handle,
      bytes,
      BigInt(bytes.byteLength),
    );
    this.#assertNativeOk(code, "write");
  }

  flush(): void {
    this.#assertOpen("flush");
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

  #assertOpen(operation: string): void {
    if (this.#closed) {
      throw new PequiNativeError(
        `Native backend ${operation} failed: native backend is already closed.`,
        {
          operation,
          destinationKind: this.#destinationKind,
          diagnostics: this.#diagnostics,
        },
      );
    }
  }

  #assertNativeOk(code: number, operation: string): void {
    if (code === 0) {
      return;
    }

    const lastError = this.#lastErrorMessage();
    throw new PequiNativeError(
      [
        `Native backend ${operation} failed with status ${code} (${nativeStatusName(code)}).`,
        `native last error: ${lastError}`,
        `destination kind: ${this.#destinationKind}`,
        `operating system: ${this.#diagnostics.os}`,
        `architecture: ${this.#diagnostics.arch}`,
        `attempted library path: ${this.#libraryPath}`,
      ].join("\n"),
      {
        statusCode: code,
        operation,
        destinationKind: this.#destinationKind,
        diagnostics: {
          ...this.#diagnostics,
          nativeErrorMessage: lastError,
        },
      },
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
  requestedMode: NativeMode,
  cause?: Error,
  overrides: Partial<NativeDiagnostics> = {},
): NativeBackendUnavailable {
  const attemptedLibraryPath = loadInfo.attemptedLibraryPaths.length === 0
    ? "none"
    : loadInfo.attemptedLibraryPaths.join(", ");
  const diagnostics = createNativeDiagnostics(loadInfo, requestedMode, {
    selectedBackend: "native",
    ...overrides,
  });

  return new NativeBackendUnavailable(
    [
      message,
      `operating system: ${loadInfo.os}`,
      `architecture: ${loadInfo.arch}`,
      `attempted library path: ${attemptedLibraryPath}`,
      "--allow-ffi may be missing: Deno FFI requires --allow-ffi to load native libraries.",
    ].join("\n"),
    { cause, diagnostics },
  );
}

function createNativeDiagnostics(
  loadInfo: NativeLoadInfo,
  requestedMode: NativeMode,
  overrides: Partial<NativeDiagnostics> = {},
): NativeDiagnostics {
  return {
    requestedMode,
    selectedBackend: overrides.selectedBackend ?? "native",
    fallbackReason: overrides.fallbackReason,
    os: loadInfo.os,
    arch: loadInfo.arch,
    attemptedLibraryPaths: loadInfo.attemptedLibraryPaths,
    abiVersionFound: overrides.abiVersionFound,
    abiVersionExpected: NATIVE_ABI_VERSION,
    dlopenFailed: overrides.dlopenFailed ?? false,
    initFailed: overrides.initFailed ?? false,
    nativeErrorMessage: overrides.nativeErrorMessage,
  };
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
