import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod, childLogger } from "./oracle/pino_oracle.ts";

Deno.test("serializers are applied to matching keys", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    serializers: {
      user(value) {
        return { id: (value as { id: string }).id };
      },
    },
  });

  log.info({ user: { id: "u-1", password: "secret" } }, "created user");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.user, { id: "u-1" });
});

Deno.test({
  name: "serializer by key and inheritance match Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const options = {
      timestamp: false,
      base: null,
      serializers: {
        user(value: unknown) {
          return { id: (value as { id: string }).id };
        },
      },
    };
    const { pinoRecords, pequiRecords } = await runBothOracles(options, (log) => {
      const child = childLogger(log, { module: "auth" });
      callMethod(child, "info", { user: { id: "1", password: "x" } }, "created");
    });

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test("serializer does not mutate original input", () => {
  const destination = memoryDestination();
  const user = { id: "1", password: "x" };
  const log = pequi({
    destination,
    timestamp: false,
    base: null,
    serializers: {
      user(value) {
        return { id: (value as { id: string }).id };
      },
    },
  });

  log.info({ user }, "created");

  assertEquals(user, { id: "1", password: "x" });
});
