import { assertEquals } from "@std/assert";
import { pequi } from "../../mod.ts";
import { createCaptureDestination } from "./oracle/capture.ts";

Deno.test("hooks.logMethod can modify arguments and receives level", () => {
  const capture = createCaptureDestination();
  const seen: unknown[] = [];
  const log = pequi({
    timestamp: false,
    base: null,
    hooks: {
      logMethod(args, method, level) {
        seen.push(level, this === log);
        (method as (...methodArgs: unknown[]) => void).apply(this, [{ hooked: true }, ...args]);
      },
    },
  }, capture);

  log.info("message");

  assertEquals(seen, [30, true]);
  assertEquals(capture.records(), [{ level: 30, hooked: true, msg: "message" }]);
});
