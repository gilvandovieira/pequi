import { assertEquals } from "@std/assert";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "log argument forms match Pino for common inputs",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null },
      (log) => {
        callMethod(log, "info");
        callMethod(log, "info", "message");
        callMethod(log, "info", "hello %s", "world");
        callMethod(log, "info", { a: 1 });
        callMethod(log, "info", { a: 1 }, "message");
        callMethod(log, "info", { a: 1 }, "hello %s", "world");
        callMethod(log, "info", null);
        callMethod(log, "info", undefined);
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
