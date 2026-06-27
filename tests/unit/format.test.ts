import { assertEquals } from "@std/assert";
import { formatJsonLine, formatMessage, normalizeLogArguments } from "../../mod.ts";
import { isError } from "../../src/serializers.ts";

Deno.test("formatMessage handles simple placeholders", () => {
  assertEquals(
    formatMessage("hello %s %d %j %%", ["world", 2, { ok: true }]),
    'hello world 2 {"ok":true} %',
  );
});

Deno.test("formatMessage matches Pino quick-format token rules", () => {
  // %d/%f coerce with Number; %i floors.
  assertEquals(formatMessage("%d %f %i", [4.9, 4.5, 4.9]), "4.9 4.5 4");
  assertEquals(formatMessage("%i", [-4.9]), "-5");
  assertEquals(formatMessage("%d", ["abc"]), "NaN");
  // %c and unknown tokens stay literal; leftover args are dropped, not appended.
  assertEquals(formatMessage("x %c y", ["css"]), "x %c y");
  assertEquals(formatMessage("plain", ["dropped", 1]), "plain");
  assertEquals(formatMessage("a %s", ["kept", "dropped"]), "a kept");
  // Missing args leave the token literal.
  assertEquals(formatMessage("a %s b %s", ["only"]), "a only b %s");
});

Deno.test("formatMessage keeps %j circular-safe like Pino", () => {
  const circular: Record<string, unknown> = { a: 1 };
  circular.s = circular;
  assertEquals(formatMessage("j %j", [circular]), 'j {"a":1,"s":"[Circular]"}');
});

Deno.test("normalizeLogArguments handles object plus message", () => {
  assertEquals(normalizeLogArguments({ userId: "123" }, "created", []), {
    userId: "123",
    msg: "created",
  });
});

Deno.test("normalizeLogArguments handles error plus message", () => {
  const record = normalizeLogArguments(new Error("boom"), "failed", []);

  assertEquals(isError(record.err), true);
  assertEquals((record.err as Error).message, "boom");
  assertEquals(record.msg, "failed");
});

Deno.test("formatJsonLine stringifies one record", () => {
  assertEquals(formatJsonLine({ level: 30, msg: "ok" }), '{"level":30,"msg":"ok"}');
});
