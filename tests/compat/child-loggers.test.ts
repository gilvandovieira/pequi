import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod, childLogger } from "./oracle/pino_oracle.ts";

Deno.test("child logger bindings are merged into every child record", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    base: { service: "api" },
    name: "api",
  });

  const child = log.child({ module: "auth" });
  child.info({ userId: "123" }, "login accepted");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.service, "api");
  assertEquals(record.name, "api");
  assertEquals(record.module, "auth");
  assertEquals(record.userId, "123");
});

Deno.test("logger exposes bindings as a read-only copy", () => {
  const log = pequi({ base: { service: "api" }, name: "api" });
  const bindings = log.bindings();
  bindings.service = "changed";

  assertEquals(log.bindings(), { service: "api", name: "api" });
});

Deno.test({
  name: "child and nested child bindings match Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: { service: "api" }, name: "api" },
      (log) => {
        const child = childLogger(log, { module: "auth" });
        const nested = childLogger(child, { requestId: "abc" });
        callMethod(nested, "info", { userId: "123" }, "login accepted");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test("child level inherits then diverges from parent", () => {
  const parent = pequi({ level: "warn", timestamp: false, base: null });
  const child = parent.child({ module: "auth" });

  assertEquals(child.level, "warn");
  child.level = "debug";
  assertEquals(parent.level, "warn");
  assertEquals(child.level, "debug");
});

Deno.test("child serializers, redaction, and msgPrefix options work", () => {
  const destination = memoryDestination();
  const parent = pequi({
    timestamp: false,
    base: null,
    destination,
    serializers: {
      user(value) {
        return { id: (value as { id: string }).id };
      },
    },
  });
  const child = parent.child({ module: "auth" }, {
    redact: ["token"],
    msgPrefix: "[AUTH] ",
  });

  child.info({ user: { id: "1", password: "x" }, token: "secret" }, "created");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.user, { id: "1" });
  assertEquals(record.token, "[Redacted]");
  assertEquals(record.msg, "[AUTH] created");
});
