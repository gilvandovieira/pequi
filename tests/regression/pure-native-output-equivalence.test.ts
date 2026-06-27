import { assertEquals } from "@std/assert";
import { equivalenceCases, nativeAvailable, runLoggerToFile } from "../native_test_helpers.ts";

Deno.test("regression: native backend preserves pure TypeScript logger semantics", async () => {
  if (!nativeAvailable()) {
    return;
  }

  for (const testCase of equivalenceCases()) {
    const options = {
      timestamp: false,
      base: null,
      ...testCase.options,
    };

    assertEquals(
      await runLoggerToFile({ ...options, native: "required" }, testCase.run),
      await runLoggerToFile({ ...options, native: false }, testCase.run),
      testCase.name,
    );
  }
});
