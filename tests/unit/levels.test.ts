import { assert, assertEquals, assertThrows } from "@std/assert";
import { DEFAULT_LEVEL, isLevelEnabled, isLogLevel, levels } from "../../mod.ts";
import { InvalidLogLevelError } from "../../src/errors.ts";
import { assertLogLevel } from "../../src/levels.ts";

Deno.test("levels expose Pino-style numeric values", () => {
  assertEquals(levels.trace, 10);
  assertEquals(levels.debug, 20);
  assertEquals(levels.info, 30);
  assertEquals(levels.warn, 40);
  assertEquals(levels.error, 50);
  assertEquals(levels.fatal, 60);
  assertEquals(DEFAULT_LEVEL, "info");
});

Deno.test("level checks compare against the active threshold", () => {
  assert(isLevelEnabled("info", "info"));
  assert(isLevelEnabled("info", "error"));
  assert(!isLevelEnabled("info", "debug"));
});

Deno.test("level validation rejects unknown names", () => {
  assert(isLogLevel("debug"));
  assert(!isLogLevel("verbose"));
  assertThrows(() => assertLogLevel("verbose"), InvalidLogLevelError);
});
