import { assertEquals } from "@std/assert";
import { discardDestination, fileDestination } from "../../mod.ts";
import { tryCreateNativeBackend } from "../../src/backends/native.ts";

Deno.test("native discard backend writes flushes and closes when available", () => {
  const backend = tryCreateNativeBackend({
    mode: "auto",
    destination: discardDestination(),
  });

  if (backend === undefined) {
    return;
  }

  backend.write('{"level":30,"msg":"discard"}');
  backend.flush();
  backend.close();
  backend.close();
});

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

    const flushedText = await Deno.readTextFile(path);
    assertEquals(flushedText.split("\n").filter((line) => line.length > 0), [
      '{"level":30,"msg":"one"}',
      '{"level":30,"msg":"two"}',
    ]);

    backend.close();
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
