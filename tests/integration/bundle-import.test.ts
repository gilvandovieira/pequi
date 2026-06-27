import { assertEquals } from "@std/assert";
import { discardDestination, pequi } from "../../dist/pequi.bundle.js";

Deno.test("bundled artifact imports and writes under Deno", () => {
  const log = pequi({
    native: false,
    timestamp: false,
    base: null,
    destination: discardDestination(),
  });

  log.info("bundle import smoke");
  assertEquals(typeof log.info, "function");
});
