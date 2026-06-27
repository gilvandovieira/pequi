import { assertEquals, assertStringIncludes } from "@std/assert";
import { fileDestination } from "../../mod.ts";
import { resolveBackend } from "../../src/backend.ts";

Deno.test("native auto mode falls back to pure TypeScript when native cannot load", async () => {
  const path = await Deno.makeTempFile({ prefix: "pequi-native-auto-", suffix: ".log" });
  const missingLibraryPath = `/tmp/pequi-missing-native-${crypto.randomUUID()}/libpequi_log.so`;

  try {
    const resolution = resolveBackend({
      native: "auto",
      nativeLibraryPath: missingLibraryPath,
      destination: fileDestination(path, { append: false }),
    });

    assertEquals(resolution.diagnostics.selectedBackend, "pure");
    assertStringIncludes(resolution.diagnostics.fallbackReason ?? "", missingLibraryPath);

    resolution.backend.write('{"level":30,"msg":"fallback"}');
    resolution.backend.flush();
    resolution.backend.close();

    const text = await Deno.readTextFile(path);
    assertEquals(text, '{"level":30,"msg":"fallback"}\n');
  } finally {
    await Deno.remove(path);
  }
});
