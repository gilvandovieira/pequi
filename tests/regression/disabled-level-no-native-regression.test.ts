import { assertEquals } from "@std/assert";
import { fileDestination, pequi } from "../../mod.ts";
import { nativeAvailable } from "../native_test_helpers.ts";

Deno.test("regression: disabled levels do not write through the native backend", async () => {
  if (!nativeAvailable()) {
    return;
  }

  const path = await Deno.makeTempFile({ prefix: "pequi-disabled-native-", suffix: ".log" });
  try {
    const log = pequi({
      native: "required",
      destination: fileDestination(path, { append: false }),
      level: "error",
      timestamp: false,
      base: null,
    });

    log.info("disabled");
    log.debug({ ignored: true }, "disabled object");
    log.flush();

    assertEquals(await Deno.readTextFile(path), "");
  } finally {
    await Deno.remove(path);
  }
});
