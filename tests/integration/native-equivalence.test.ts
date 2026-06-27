import { assertEquals } from "@std/assert";
import { equivalenceCases, nativeAvailable, runLoggerToFile } from "../native_test_helpers.ts";

Deno.test("native logger output matches pure TypeScript output for core semantics", async () => {
  if (!nativeAvailable()) {
    return;
  }

  for (const testCase of equivalenceCases()) {
    const baseOptions = {
      timestamp: false,
      base: null,
      ...testCase.options,
    };

    const pureRecords = await runLoggerToFile(
      { ...baseOptions, native: false },
      testCase.run,
    );
    const nativeRecords = await runLoggerToFile(
      { ...baseOptions, native: "required" },
      testCase.run,
    );

    assertEquals(nativeRecords, pureRecords, testCase.name);
  }
});
