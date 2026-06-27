import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test("name, base, and child bindings are included", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    name: "pequi-test",
    base: { service: "api" },
  });

  log.child({ reqId: "req-1" }).info("bound");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.name, "pequi-test");
  assertEquals(record.service, "api");
  assertEquals(record.reqId, "req-1");
});

Deno.test({
  name: "bindings() and setBindings() match Pino output behavior",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: { service: "api" }, name: "api" },
      (log) => {
        const setBindings = log.setBindings;
        if (typeof setBindings !== "function") {
          throw new TypeError("setBindings missing");
        }
        setBindings.call(log, { requestId: "abc" });
        callMethod(log, "info", "bound");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
