import { assert, assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("error first argument is logged under err", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.error(new Error("boom"), "request failed");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.msg, "request failed");
  assertEquals(record.err.type, "Error");
  assertEquals(record.err.message, "boom");
  assert(typeof record.err.stack === "string");
});
