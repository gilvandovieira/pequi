import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test("top-level redaction censors configured keys", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    redact: ["password", "token"],
  });

  log.info({
    userId: "123",
    password: "secret",
    token: "token-1",
  }, "login");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.userId, "123");
  assertEquals(record.password, "[Redacted]");
  assertEquals(record.token, "[Redacted]");
});

Deno.test({
  name: "redaction subset matches Pino for paths and censor string",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: { password: "root" },
        redact: { paths: ["password", "user.password"], censor: "[SECRET]" },
      },
      (log) => {
        callMethod(log, "info", {
          user: { id: "1", password: "secret" },
          password: "secret",
        }, "redacted");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test("redaction remove and censor function work without mutating input", () => {
  const destination = memoryDestination();
  const payload = { user: { id: "1", password: "secret" }, token: "abc" };
  const log = pequi({
    destination,
    timestamp: false,
    base: null,
    redact: {
      paths: ["user.password", "token"],
      remove: false,
      censor(value, path) {
        return `${path}:${String(value).length}`;
      },
    },
  });

  log.info(payload, "redacted");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.user.password, "user.password:6");
  assertEquals(record.token, "token:3");
  assertEquals(payload, { user: { id: "1", password: "secret" }, token: "abc" });
});
