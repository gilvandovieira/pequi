/**
 * Backend selection.
 *
 * Chooses between the pure TypeScript backend and the optional Rust native backend based on the
 * {@linkcode NativeMode}. {@linkcode resolveBackend} returns the chosen backend plus
 * {@linkcode NativeDiagnostics} (so callers can confirm native loaded), while
 * {@linkcode createBackend} returns just the backend for normal use.
 *
 * @module
 */

import { createPureBackend } from "./backends/pure.ts";
import {
  createNativeBackendResult,
  getNativeLoadInfo,
  NATIVE_ABI_VERSION,
} from "./backends/native.ts";
import type { Backend, Destination, NativeDiagnostics, NativeMode } from "./types.ts";

/** Options controlling backend selection and construction. */
export interface CreateBackendOptions {
  /** Native backend selection mode; defaults to `false` (pure TypeScript). */
  native?: NativeMode;
  /** Where the backend writes. */
  destination?: Destination;
  /** Line ending appended to each log line. */
  lineEnding?: "\n" | "\r\n";
  /** Native file buffer size in bytes; `0` disables buffering. */
  nativeBufferSize?: number;
  /** Explicit native library path, overriding the default prebuilt resolution. */
  nativeLibraryPath?: string;
}

/** The selected {@linkcode Backend} plus the {@linkcode NativeDiagnostics} for the resolution. */
export interface BackendResolution {
  /** The selected backend. */
  backend: Backend;
  /** Diagnostics describing how selection resolved, including any fallback reason. */
  diagnostics: NativeDiagnostics;
}

/**
 * Create a backend, discarding diagnostics. This is the normal entrypoint.
 *
 * @param options Backend selection and construction options.
 * @returns The selected backend.
 */
export function createBackend(options: CreateBackendOptions = {}): Backend {
  return resolveBackend(options).backend;
}

/**
 * Resolve a backend and return it together with native diagnostics.
 *
 * In `native: "auto"`, a native load failure is captured in diagnostics and the pure backend is
 * returned; in `native: "required"`, the failure is rethrown.
 *
 * @param options Backend selection and construction options.
 * @returns The backend and its resolution diagnostics.
 */
export function resolveBackend(options: CreateBackendOptions = {}): BackendResolution {
  const requestedMode = options.native ?? false;

  if (requestedMode === false) {
    return createPureResolution(options, requestedMode);
  }

  try {
    return createNativeBackendResult({
      mode: requestedMode,
      destination: options.destination,
      lineEnding: options.lineEnding,
      bufferSize: options.nativeBufferSize,
      libraryPath: options.nativeLibraryPath,
    });
  } catch (error) {
    if (requestedMode === "required") {
      throw error;
    }

    return createPureResolution(options, requestedMode, error);
  }
}

function createPureResolution(
  options: CreateBackendOptions,
  requestedMode: NativeMode,
  fallbackError?: unknown,
): BackendResolution {
  const loadInfo = getNativeLoadInfo(options.nativeLibraryPath);
  const fallbackDiagnostics = extractDiagnostics(fallbackError);
  const fallbackReason = fallbackError === undefined ? undefined : errorMessage(fallbackError);

  return {
    backend: createPureBackend({
      destination: options.destination,
      lineEnding: options.lineEnding,
    }),
    diagnostics: {
      requestedMode,
      selectedBackend: "pure",
      fallbackReason,
      os: loadInfo.os,
      arch: loadInfo.arch,
      attemptedLibraryPaths: loadInfo.attemptedLibraryPaths,
      abiVersionFound: fallbackDiagnostics?.abiVersionFound,
      abiVersionExpected: NATIVE_ABI_VERSION,
      dlopenFailed: fallbackDiagnostics?.dlopenFailed ?? false,
      initFailed: fallbackDiagnostics?.initFailed ?? false,
      nativeErrorMessage: fallbackDiagnostics?.nativeErrorMessage,
    },
  };
}

function extractDiagnostics(error: unknown): NativeDiagnostics | undefined {
  const diagnostics = (error as { diagnostics?: unknown } | null)?.diagnostics;
  return isNativeDiagnostics(diagnostics) ? diagnostics : undefined;
}

function isNativeDiagnostics(value: unknown): value is NativeDiagnostics {
  return typeof value === "object" && value !== null &&
    typeof (value as { selectedBackend?: unknown }).selectedBackend === "string" &&
    typeof (value as { abiVersionExpected?: unknown }).abiVersionExpected === "number";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
