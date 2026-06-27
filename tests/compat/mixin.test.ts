import { assertEquals } from "@std/assert";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "mixin fields are added and log object wins by default",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const options = {
      timestamp: false,
      base: null,
      mixin() {
        return { requestId: "mixin", mixinOnly: true };
      },
    };
    const { pinoRecords, pequiRecords } = await runBothOracles(
      options,
      (log) => callMethod(log, "info", { requestId: "log" }, "mixed"),
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "mixinMergeStrategy can customize merge behavior",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const options = {
      timestamp: false,
      base: null,
      mixin() {
        return { requestId: "mixin" };
      },
      mixinMergeStrategy(
        mergeObject: Record<string, unknown>,
        mixinObject: Record<string, unknown>,
      ) {
        return { ...mergeObject, ...mixinObject, strategy: true };
      },
    };
    const { pinoRecords, pequiRecords } = await runBothOracles(
      options,
      (log) => callMethod(log, "info", { requestId: "log" }, "mixed"),
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
