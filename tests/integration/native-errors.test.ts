import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { discardDestination, fileDestination } from "../../mod.ts";
import { resolveBackend } from "../../src/backend.ts";
import { NativeBackendUnavailable } from "../../src/errors.ts";
import {
  createNativeBackend,
  loadNativeLibrary,
  type NativeLibrary,
} from "../../src/backends/native.ts";
import { nativeAvailable } from "../native_test_helpers.ts";

Deno.test("native invalid file path fails clearly", () => {
  if (!nativeAvailable()) {
    return;
  }

  const path = `/tmp/pequi-missing-dir-${crypto.randomUUID()}/native.log`;
  const error = assertThrows(
    () =>
      createNativeBackend({
        mode: "required",
        destination: fileDestination(path),
      }),
    NativeBackendUnavailable,
  );

  assertStringIncludes(error.message, Deno.build.os);
  assertStringIncludes(error.message, Deno.build.arch);
  assertStringIncludes(error.message, "initialization failed");
});

Deno.test("native missing library path reports cleanly", () => {
  const missingPath = `/tmp/pequi-missing-native-${crypto.randomUUID()}/libpequi_log.so`;
  const error = assertThrows(
    () =>
      createNativeBackend({
        mode: "required",
        destination: discardDestination(),
        libraryPath: missingPath,
      }),
    NativeBackendUnavailable,
  );

  assertStringIncludes(error.message, missingPath);
  assertStringIncludes(error.message, "--allow-ffi may be missing");
});

Deno.test("native invalid destination kind is handled by Rust ABI", () => {
  const loaded = tryLoadNativeLibrary();
  if (loaded === undefined) {
    return;
  }

  try {
    const empty = new Uint8Array(0);
    const handle = loaded.symbols.pequi_init(99, empty, 0n, 0n);
    assertEquals(handle, null);

    const message = readGlobalLastError(loaded);
    assertStringIncludes(message, "invalid destination kind");
  } finally {
    loaded.close();
  }
});

Deno.test("native auto diagnostics record fallback reason", () => {
  const missingPath = `/tmp/pequi-missing-native-${crypto.randomUUID()}/libpequi_log.so`;
  const resolution = resolveBackend({
    native: "auto",
    nativeLibraryPath: missingPath,
    destination: discardDestination(),
  });

  assertEquals(resolution.diagnostics.selectedBackend, "pure");
  assert(resolution.diagnostics.dlopenFailed);
  assertStringIncludes(resolution.diagnostics.fallbackReason ?? "", missingPath);
});

function tryLoadNativeLibrary(): NativeLibrary | undefined {
  try {
    return loadNativeLibrary().library;
  } catch {
    return undefined;
  }
}

function readGlobalLastError(library: NativeLibrary): string {
  const empty = new Uint8Array(0);
  const length = Number(library.symbols.pequi_last_error_global(empty, 0n));
  const buffer = new Uint8Array(length);
  const copied = Number(library.symbols.pequi_last_error_global(buffer, BigInt(buffer.byteLength)));
  return new TextDecoder().decode(buffer.subarray(0, copied || length));
}
