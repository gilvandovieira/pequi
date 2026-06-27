import { assertEquals } from "@std/assert";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "error argument forms match Pino normalized shape",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null },
      (log) => {
        callMethod(log, "error", new Error("boom"));
        callMethod(log, "error", new Error("boom"), "failed");
        callMethod(log, "error", { err: new Error("boom") }, "failed");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "custom errorKey writes errors under the configured key",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null, errorKey: "error" },
      (log) => callMethod(log, "error", new Error("boom"), "failed"),
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "err serializer can override error output",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const options = {
      timestamp: false,
      base: null,
      serializers: {
        err(value: unknown) {
          return { message: (value as Error).message, custom: true };
        },
      },
    };
    const { pinoRecords, pequiRecords } = await runBothOracles(
      options,
      (log) => callMethod(log, "error", new Error("boom")),
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
