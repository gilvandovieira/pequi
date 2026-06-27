import { assertEquals } from "@std/assert";
import { fileDestination } from "../../mod.ts";
import { createNativeBackend } from "../../src/backends/native.ts";
import { nativeAvailable, parseJsonLines } from "../native_test_helpers.ts";

Deno.test("regression: native file flush and close write every line once", async () => {
  if (!nativeAvailable()) {
    return;
  }

  const path = await Deno.makeTempFile({ prefix: "pequi-native-flush-", suffix: ".log" });
  const count = 250;

  try {
    const backend = createNativeBackend({
      mode: "required",
      destination: fileDestination(path, { append: false }),
      bufferSize: 16 * 1024,
    });

    for (let index = 0; index < count; index += 1) {
      backend.write(`{"level":30,"index":${index}}`);
    }
    backend.flush();
    backend.close();

    const records = parseJsonLines(await Deno.readTextFile(path));
    assertEquals(records.length, count);
    assertEquals(records[0], { level: 30, index: 0 });
    assertEquals(records[count - 1], { level: 30, index: count - 1 });
  } finally {
    await Deno.remove(path);
  }
});
