import { assertEquals } from "@std/assert";
import { fileDestination } from "../../mod.ts";
import { resolveBackend } from "../../src/backend.ts";

Deno.test("regression: native auto fallback matches pure backend output", async () => {
  const purePath = await Deno.makeTempFile({ prefix: "pequi-pure-", suffix: ".log" });
  const fallbackPath = await Deno.makeTempFile({ prefix: "pequi-fallback-", suffix: ".log" });
  const missingPath = `/tmp/pequi-missing-native-${crypto.randomUUID()}/libpequi_log.so`;

  try {
    const pure = resolveBackend({
      native: false,
      destination: fileDestination(purePath, { append: false }),
    });
    const fallback = resolveBackend({
      native: "auto",
      nativeLibraryPath: missingPath,
      destination: fileDestination(fallbackPath, { append: false }),
    });

    for (const backend of [pure.backend, fallback.backend]) {
      backend.write('{"level":30,"msg":"same"}');
      backend.write('{"level":40,"msg":"same warn"}');
      backend.flush();
      backend.close();
    }

    assertEquals(await Deno.readTextFile(fallbackPath), await Deno.readTextFile(purePath));
    assertEquals(fallback.diagnostics.selectedBackend, "pure");
  } finally {
    await Deno.remove(purePath);
    await Deno.remove(fallbackPath);
  }
});
