import { assert, assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("logger exposes the intended Pino-compatible shape", () => {
  const log = pequi({ destination: memoryDestination() });

  assertEquals(typeof log.trace, "function");
  assertEquals(typeof log.debug, "function");
  assertEquals(typeof log.info, "function");
  assertEquals(typeof log.warn, "function");
  assertEquals(typeof log.error, "function");
  assertEquals(typeof log.fatal, "function");
  assertEquals(typeof log.child, "function");
  assertEquals(typeof log.flush, "function");
  assertEquals(typeof log.isLevelEnabled, "function");
  assertEquals(typeof log.bindings, "function");
  assertEquals(typeof log.setBindings, "function");
  assertEquals(typeof log.on, "function");
  assertEquals(typeof log.once, "function");
  assertEquals(typeof log.removeListener, "function");
  assertEquals(typeof log.silent, "function");
});

Deno.test("records include numeric level, time, and msg", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info("shape");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.level, 30);
  assert(typeof record.time === "number");
  assertEquals(record.msg, "shape");
});
