import { assertEquals } from "@std/assert";
import { fileDestination } from "../../mod.ts";
import { tryCreateNativeBackend } from "../../src/backends/native.ts";

Deno.test("native file backend writes newline-delimited lines when available", async () => {
  const path = await Deno.makeTempFile({ prefix: "pequi-native-", suffix: ".log" });

  try {
    const backend = tryCreateNativeBackend({
      mode: "auto",
      destination: fileDestination(path, { append: false }),
      bufferSize: 64 * 1024,
    });

    if (backend === undefined) {
      return;
    }

    backend.write('{"level":30,"msg":"one"}');
    backend.write('{"level":30,"msg":"two"}');
    backend.flush();
    backend.close();

    const text = await Deno.readTextFile(path);
    assertEquals(text.split("\n").filter((line) => line.length > 0), [
      '{"level":30,"msg":"one"}',
      '{"level":30,"msg":"two"}',
    ]);
  } finally {
    await Deno.remove(path);
  }
});
