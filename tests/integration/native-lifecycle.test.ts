import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { fileDestination, pequi } from "../../mod.ts";
import { PequiNativeError } from "../../src/errors.ts";
import { createNativeBackend } from "../../src/backends/native.ts";
import { nativeAvailable, parseJsonLines } from "../native_test_helpers.ts";

Deno.test("native backend flush and close are idempotent", async () => {
  if (!nativeAvailable()) {
    return;
  }

  const path = await Deno.makeTempFile({ prefix: "pequi-native-lifecycle-", suffix: ".log" });
  try {
    const backend = createNativeBackend({
      mode: "required",
      destination: fileDestination(path, { append: false }),
      bufferSize: 1024,
    });

    backend.write('{"level":30,"msg":"one"}');
    backend.flush();
    backend.flush();
    backend.close();
    backend.close();

    const text = await Deno.readTextFile(path);
    assertEquals(parseJsonLines(text), [{ level: 30, msg: "one" }]);

    const error = assertThrows(
      () => backend.write('{"level":30,"msg":"after close"}'),
      PequiNativeError,
      "already closed",
    );
    assertInstanceOf(error, PequiNativeError);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("child loggers share the native backend without changing output", async () => {
  if (!nativeAvailable()) {
    return;
  }

  const path = await Deno.makeTempFile({ prefix: "pequi-native-child-", suffix: ".log" });
  try {
    const log = pequi({
      native: "required",
      destination: fileDestination(path, { append: false }),
      timestamp: false,
      base: null,
    });

    log.info("parent");
    log.child({ module: "child" }).info("child");
    log.flush();

    const records = parseJsonLines(await Deno.readTextFile(path));
    assertEquals(records, [
      { level: 30, msg: "parent" },
      { level: 30, module: "child", msg: "child" },
    ]);
  } finally {
    await Deno.remove(path);
  }
});
