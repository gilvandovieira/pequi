import { assertEquals } from "@std/assert";
import { formatJsonLine, formatMessage, normalizeLogArguments } from "../../mod.ts";
import { isError } from "../../src/serializers.ts";

Deno.test("formatMessage handles simple placeholders", () => {
  assertEquals(
    formatMessage("hello %s %d %j %%", ["world", 2, { ok: true }]),
    'hello world 2 {"ok":true} %',
  );
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
