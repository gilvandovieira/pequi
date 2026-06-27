import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("object plus message arguments work", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info({ userId: "123", active: true }, "user logged in");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.userId, "123");
  assertEquals(record.active, true);
  assertEquals(record.msg, "user logged in");
});
