import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test("string messages support simple placeholders", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info("hello %s %d %j", "world", 2, { ok: true });

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.msg, 'hello world 2 {"ok":true}');
});

Deno.test("extra message arguments are dropped, matching Pino", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info("hello", "world", { ok: true });

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.msg, "hello");
});

Deno.test({
  name: "format tokens and argument counts match Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null },
      (log) => {
        callMethod(log, "info", "str %s num %d", "x", 7);
        callMethod(log, "info", "int %i float %f", 4.9, -4.9);
        callMethod(log, "info", "obj %o", { a: 1, b: { c: 2 } });
        callMethod(log, "info", "json %j", { ok: true });
        callMethod(log, "info", "css %c stays", "color:red");
        callMethod(log, "info", "missing %s %s", "only-one");
        callMethod(log, "info", "extra %s", "kept", "dropped", 9);
        callMethod(log, "info", "no tokens", "dropped", 1);
        callMethod(log, "info", "literal %% and %s", "value");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
