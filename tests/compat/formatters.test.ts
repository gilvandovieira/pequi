import { assertEquals } from "@std/assert";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "formatters.level matches Pino for basic replacement",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const options = {
      timestamp: false,
      base: null,
      formatters: {
        level(label: string) {
          return { level: label };
        },
      },
    };
    const { pinoRecords, pequiRecords } = await runBothOracles(
      options,
      (log) => callMethod(log, "info", "formatted"),
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "formatters.bindings and formatters.log match Pino for basic transforms",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const options = {
      timestamp: false,
      base: { service: "api" },
      formatters: {
        bindings(bindings: Record<string, unknown>) {
          return { serviceName: bindings.service };
        },
        log(object: Record<string, unknown>) {
          return { ...object, formatted: true };
        },
      },
    };
    const { pinoRecords, pequiRecords } = await runBothOracles(
      options,
      (log) => callMethod(log, "info", { userId: "123" }, "formatted"),
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
