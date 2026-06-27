import { assertEquals } from "@std/assert";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "circular references match Pino instead of throwing",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null },
      (log) => {
        const self: Record<string, unknown> = { name: "x" };
        self.self = self;
        callMethod(log, "info", self, "circular");

        const nested: Record<string, unknown> = { id: 1 };
        callMethod(log, "info", { child: nested, parent: { nested } }, "shared");

        const cyclic: Record<string, unknown> = { a: {} };
        (cyclic.a as Record<string, unknown>).back = cyclic;
        callMethod(log, "info", cyclic, "nested cycle");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "non-serializable values match Pino instead of throwing",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null },
      (log) => {
        callMethod(log, "info", { big: 10n, negBig: -7n }, "bigint");
        callMethod(log, "info", { nan: NaN, inf: Infinity, ninf: -Infinity }, "non-finite");
        callMethod(log, "info", { u: undefined, fn: () => 1, sym: Symbol("s"), nul: null }, "drop");
        callMethod(log, "info", { arr: [undefined, () => 1, 3] }, "array holes");
        callMethod(log, "info", { d: { toJSON: () => ({ kept: true }) } }, "toJSON");
        callMethod(log, "info", { when: new Date(0) }, "date");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
