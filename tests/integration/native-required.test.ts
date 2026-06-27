import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { discardDestination } from "../../mod.ts";
import { NativeBackendUnavailable } from "../../src/errors.ts";
import { createNativeBackend, tryCreateNativeBackend } from "../../src/backends/native.ts";

Deno.test("native required mode fails clearly when library cannot load", () => {
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

  assertStringIncludes(error.message, Deno.build.os);
  assertStringIncludes(error.message, Deno.build.arch);
  assertStringIncludes(error.message, missingPath);
  assertStringIncludes(error.message, "--allow-ffi may be missing");
  const diagnostics = error.diagnostics as { attemptedLibraryPaths?: string[] } | undefined;
  assertEquals(diagnostics?.attemptedLibraryPaths, [missingPath]);
});

Deno.test("native required mode succeeds when native is available", () => {
  const autoBackend = tryCreateNativeBackend({
    mode: "auto",
    destination: discardDestination(),
  });

  if (autoBackend === undefined) {
    return;
  }
  autoBackend.close();

  const requiredBackend = createNativeBackend({
    mode: "required",
    destination: discardDestination(),
  });

  try {
    requiredBackend.write('{"level":30,"msg":"required"}');
    requiredBackend.flush();
  } finally {
    requiredBackend.close();
  }
});
