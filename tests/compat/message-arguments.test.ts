import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("string messages support simple placeholders", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info("hello %s %d %j", "world", 2, { ok: true });

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.msg, 'hello world 2 {"ok":true}');
});

Deno.test("extra message arguments are appended", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info("hello", "world", { ok: true });

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.msg, 'hello world {"ok":true}');
});
