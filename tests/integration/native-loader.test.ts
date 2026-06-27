import { assert, assertEquals, assertThrows } from "@std/assert";
import { memoryDestination, stdoutDestination } from "../../mod.ts";
import { NativeBackendUnavailable } from "../../src/errors.ts";
import {
  isNativePlatformSupported,
  resolveNativeLibraryPath,
  resolveNativeTarget,
  tryCreateNativeBackend,
} from "../../src/backends/native.ts";

Deno.test("native auto mode skips cleanly when unavailable", () => {
  const backend = tryCreateNativeBackend({
    mode: "auto",
    destination: stdoutDestination(),
  });

  backend?.close();
});

Deno.test("native required mode fails clearly for unsupported destination", () => {
  assertThrows(
    () =>
      tryCreateNativeBackend({
        mode: "required",
        destination: memoryDestination(),
      }),
    NativeBackendUnavailable,
    "stdout destination",
  );
});

Deno.test("native target detection is explicit", () => {
  assertEquals(isNativePlatformSupported(), resolveNativeTarget() !== undefined);

  const path = resolveNativeLibraryPath();
  if (isNativePlatformSupported()) {
    assert(path?.endsWith("libpequi_native.so"));
  } else {
    assertEquals(path, undefined);
  }
});
