import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("child logger merges bindings into records", () => {
  const destination = memoryDestination();
  const log = pequi({ destination, base: { service: "api" } });
  const child = log.child({ reqId: "req-1" });

  child.info({ userId: "123" }, "handled");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.service, "api");
  assertEquals(record.reqId, "req-1");
  assertEquals(record.userId, "123");
});

Deno.test("child logger can override level", () => {
  const destination = memoryDestination();
  const log = pequi({ destination, level: "info" });
  const child = log.child({ reqId: "req-2" }, { level: "debug" });

  log.debug("parent hidden");
  child.debug("child visible");

  assertEquals(destination.lines.length, 1);
  assertEquals(JSON.parse(destination.lines[0]).reqId, "req-2");
});
