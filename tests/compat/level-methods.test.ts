import { assertEquals } from "@std/assert";
import { levels, pequi } from "../../mod.ts";
import { createCaptureDestination } from "./oracle/capture.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "level methods match Pino output for core levels",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { level: "trace", timestamp: false, base: null },
      (log) => {
        callMethod(log, "trace", "trace");
        callMethod(log, "debug", "debug");
        callMethod(log, "info", "info");
        callMethod(log, "warn", "warn");
        callMethod(log, "error", "error");
        callMethod(log, "fatal", "fatal");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test("silent method exists and does not write", () => {
  const capture = createCaptureDestination();
  const log = pequi({ timestamp: false, base: null }, capture);

  log.silent("hidden");

  assertEquals(capture.records(), []);
});

Deno.test("default level, levelVal, levels mapping, and isLevelEnabled match expectations", () => {
  const log = pequi({ timestamp: false, base: null });

  assertEquals(log.level, "info");
  assertEquals(log.levelVal, 30);
  assertEquals(levels.silent, Infinity);
  assertEquals(log.levels.values.info, 30);
  assertEquals(log.isLevelEnabled("trace"), false);
  assertEquals(log.isLevelEnabled("debug"), false);
  assertEquals(log.isLevelEnabled("info"), true);
  assertEquals(log.isLevelEnabled("warn"), true);
  assertEquals(log.isLevelEnabled("error"), true);
  assertEquals(log.isLevelEnabled("fatal"), true);
  assertEquals(log.isLevelEnabled("silent"), true);
});

Deno.test("level setter supports silent and emits level-change", () => {
  const log = pequi({ timestamp: false, base: null });
  const events: unknown[][] = [];

  log.on("level-change", (...args) => events.push(args));
  log.level = "debug";
  assertEquals(log.level, "debug");
  assertEquals(log.levelVal, 20);
  log.level = "silent";
  assertEquals(log.level, "silent");
  assertEquals(log.levelVal, Infinity);

  assertEquals(events[0].slice(0, 4), ["debug", 20, "info", 30]);
  assertEquals(events[0][4], log);
  assertEquals(events[1].slice(0, 4), ["silent", Infinity, "debug", 20]);
});
