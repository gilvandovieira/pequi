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
        return `${path.join(".")}:${String(value).length}`;
      },
    },
  });

  log.info(payload, "redacted");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.user.password, "user.password:6");
  assertEquals(record.token, "token:3");
  assertEquals(payload, { user: { id: "1", password: "secret" }, token: "abc" });
});

Deno.test({
  name: "wildcard, bracket, and array redaction paths match Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: null,
        redact: [
          "creds.*",
          "*.secret",
          "items[*].token",
          "matrix[1]",
          'meta["a.b"]',
        ],
      },
      (log) => {
        callMethod(log, "info", {
          creds: { user: "u", pass: "p" },
          a: { secret: "s1", keep: 1 },
          b: { secret: "s2" },
          items: [{ token: "t1", id: 1 }, { token: "t2", id: 2 }],
          matrix: [10, 20, 30],
          meta: { "a.b": "hidden", other: "shown" },
        }, "mixed paths");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "remove and array-path censor receive the same path as Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: null,
        redact: {
          paths: ["audit[*].secret", "dropme"],
          censor: (_value: unknown, path: string[]) => `at:${path.join("/")}`,
        },
      },
      (log) => {
        callMethod(log, "info", {
          audit: [{ secret: "x" }, { secret: "y" }],
          dropme: "gone",
          keep: "stay",
        }, "censor path");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
