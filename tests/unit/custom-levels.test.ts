import { assertEquals, assertThrows } from "@std/assert";
import { buildLevelRegistry } from "../../src/levels.ts";
import { memoryDestination, pequi } from "../../mod.ts";
import type { Logger, LogMethod } from "../../mod.ts";

type LoggerWithHttp = Logger & { http: LogMethod };

Deno.test("buildLevelRegistry merges custom levels with core levels", () => {
  const registry = buildLevelRegistry({ customLevels: { http: 35 } });
  assertEquals(registry.values.http, 35);
  assertEquals(registry.values.info, 30);
  assertEquals(registry.labels[35], "http");
  assertEquals(registry.valueOf("silent"), Infinity);
});

Deno.test("useOnlyCustomLevels drops the core levels", () => {
  const registry = buildLevelRegistry({
    customLevels: { low: 10, high: 30 },
    useOnlyCustomLevels: true,
  });
  assertEquals(registry.has("info"), false);
  assertEquals(registry.has("low"), true);
  assertThrows(() => registry.valueOf("info"));
});

Deno.test("isEnabled honors ASC and DESC comparison", () => {
  const asc = buildLevelRegistry({});
  assertEquals(asc.isEnabled("info", "error"), true);
  assertEquals(asc.isEnabled("info", "debug"), false);

  const desc = buildLevelRegistry({
    customLevels: { a: 10, b: 20, c: 30 },
    useOnlyCustomLevels: true,
    levelComparison: "DESC",
  });
  assertEquals(desc.isEnabled("b", "a"), true);
  assertEquals(desc.isEnabled("b", "c"), false);
});

Deno.test("isEnabled supports a custom comparison function", () => {
  const seen: Array<[number, number]> = [];
  const registry = buildLevelRegistry({
    customLevels: { a: 10, b: 20, c: 30 },
    useOnlyCustomLevels: true,
    levelComparison: (candidate, active) => {
      seen.push([candidate, active]);
      return candidate === 10;
    },
  });
  assertEquals(registry.isEnabled("b", "a"), true);
  assertEquals(registry.isEnabled("b", "c"), false);
  assertEquals(seen, [[10, 20], [30, 20]]);
});

Deno.test("silent threshold disables every level under any comparison", () => {
  const desc = buildLevelRegistry({ levelComparison: "DESC" });
  assertEquals(desc.isEnabled("silent", "fatal"), false);
});

Deno.test("logger exposes generated custom-level methods and merged levels", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    timestamp: false,
    customLevels: { http: 35 },
    level: "http",
  }) as LoggerWithHttp;

  assertEquals(typeof log.http, "function");
  assertEquals(log.levels.values.http, 35);

  log.http("request");
  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.level, 35);
  assertEquals(record.msg, "request");
});

Deno.test("useOnlyCustomLevels removes core methods on the logger", () => {
  const log = pequi({
    timestamp: false,
    customLevels: { http: 35 },
    useOnlyCustomLevels: true,
    level: "http",
  }) as LoggerWithHttp;
  assertEquals(typeof log.http, "function");
  assertEquals(typeof log.info, "undefined");
  assertEquals(typeof log.trace, "undefined");
});

Deno.test("useOnlyCustomLevels requires the active level to be custom", () => {
  assertThrows(
    () => pequi({ customLevels: { http: 35 }, useOnlyCustomLevels: true }),
    Error,
    "must be included in custom levels",
  );
});

Deno.test("setting the level validates against the registry", () => {
  const log = pequi({ timestamp: false, customLevels: { http: 35 } }) as LoggerWithHttp;
  log.level = "http";
  assertEquals(log.levelVal, 35);
  assertThrows(() => {
    log.level = "nope";
  });
});
