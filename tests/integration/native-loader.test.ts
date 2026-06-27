import { assertEquals } from "@std/assert";
import { discardDestination } from "../../mod.ts";
import {
  createNativeBackend,
  isNativePlatformSupported,
  loadNativeLibrary,
  NATIVE_ABI_VERSION,
  resolveNativeLibraryPath,
  resolveNativeTarget,
  tryCreateNativeBackend,
} from "../../src/backends/native.ts";

Deno.test("native auto mode skips cleanly when unavailable", () => {
  const backend = tryCreateNativeBackend({
    mode: "auto",
    destination: discardDestination(),
  });

  backend?.close();
});

Deno.test("native target detection is explicit", () => {
  assertEquals(isNativePlatformSupported(), resolveNativeTarget() !== undefined);

  const path = resolveNativeLibraryPath();
  if (isNativePlatformSupported()) {
    assertEquals(path?.endsWith("libpequi_log.so"), true);
  } else {
    assertEquals(path, undefined);
  }
});

Deno.test("native loader validates ABI and discard lifecycle when available", () => {
  const loaded = tryLoadNativeLibrary();
  if (loaded === undefined) {
    return;
  }
  loaded.library.close();

  const backend = createNativeBackend({
    mode: "required",
    destination: discardDestination(),
  });

  try {
    assertEquals(loaded.abiVersion, NATIVE_ABI_VERSION);
    backend.write('{"level":30,"msg":"native"}');
    backend.flush();
  } finally {
    backend.close();
  }
});

function tryLoadNativeLibrary(): ReturnType<typeof loadNativeLibrary> | undefined {
  try {
    return loadNativeLibrary();
  } catch {
    return undefined;
  }
}
