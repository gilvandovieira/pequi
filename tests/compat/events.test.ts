import { assertEquals } from "@std/assert";
import { pequi } from "../../mod.ts";

Deno.test("level-change event and listener methods work", () => {
  const log = pequi({ timestamp: false, base: null });
  const events: unknown[][] = [];
  const listener = (...args: unknown[]) => events.push(args);

  log.on("level-change", listener);
  log.level = "debug";
  log.removeListener("level-change", listener);
  log.level = "warn";

  log.once("level-change", listener);
  log.level = "error";
  log.level = "fatal";

  assertEquals(events.length, 2);
  assertEquals(events[0].slice(0, 4), ["debug", 20, "info", 30]);
  assertEquals(events[1].slice(0, 4), ["error", 50, "warn", 40]);
});
