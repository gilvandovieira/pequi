import { createPureBackend } from "./backends/pure.ts";
import {
  createNativeBackendResult,
  getNativeLoadInfo,
  NATIVE_ABI_VERSION,
} from "./backends/native.ts";
import type { Backend, Destination, NativeDiagnostics, NativeMode } from "./types.ts";

export interface CreateBackendOptions {
  native?: NativeMode;
  destination?: Destination;
  lineEnding?: "\n" | "\r\n";
  nativeBufferSize?: number;
  nativeLibraryPath?: string;
}

export interface BackendResolution {
  backend: Backend;
  diagnostics: NativeDiagnostics;
}

export function createBackend(options: CreateBackendOptions = {}): Backend {
  return resolveBackend(options).backend;
}

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
