import { assertEquals, assertStringIncludes } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "serializers then redaction compose like Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: null,
        serializers: {
          // deno-lint-ignore no-explicit-any
          user(u: any) {
            return { id: u.id, token: u.token };
          },
        },
        redact: ["user.token", "*.secret"],
      },
      (log) => {
        callMethod(
          log,
          "info",
          { user: { id: "1", token: "t", pw: "x" }, meta: { secret: "s", keep: 1 } },
          "composed",
        );
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test("redaction runs on a serializer's output, not the original", () => {
  const destination = memoryDestination();
  const original = { id: "1", token: "secret-token", pw: "x" };
  const log = pequi({
    destination,
    timestamp: false,
    base: null,
    serializers: {
      user(u) {
        return { id: (u as typeof original).id, token: (u as typeof original).token };
      },
    },
    redact: ["user.token"],
  });

  log.info({ user: original }, "m");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.user, { id: "1", token: "[Redacted]" });
  // The serializer dropped `pw`, and the caller's object is untouched.
  assertEquals(original, { id: "1", token: "secret-token", pw: "x" });
});

Deno.test("redaction censors a Date- and BigInt-bearing record without corrupting it", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    timestamp: false,
    base: null,
    redact: ["password"],
  });

  log.info({ when: new Date(0), big: 9007199254740993n, password: "x" }, "m");

  const line = destination.lines[0];
  // BigInt is emitted with full precision as a raw numeric literal (asserted on the raw line,
  // since JSON.parse would round it to a float).
  assertStringIncludes(line, '"big":9007199254740993');
  const record = JSON.parse(line);
  assertEquals(record.when, "1970-01-01T00:00:00.000Z");
  assertEquals(record.password, "[Redacted]");
});
