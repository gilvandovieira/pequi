import { assert, assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("logger writes newline-delimited JSON to memory destination", () => {
  const destination = memoryDestination();
  const log = pequi({ level: "info", destination });

  log.info("server started");

  assertEquals(destination.lines.length, 1);
  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.level, 30);
  assertEquals(record.msg, "server started");
  assert(typeof record.time === "number");
});

Deno.test("logger skips disabled levels and supports level changes", () => {
  const destination = memoryDestination();
  const log = pequi({ level: "info", destination });

  log.debug("hidden");
  assertEquals(destination.lines.length, 0);

  log.level = "debug";
  log.debug("visible");

  assertEquals(destination.lines.length, 1);
  assertEquals(JSON.parse(destination.lines[0]).msg, "visible");
});

Deno.test("logger accepts object plus message", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info({ userId: "123" }, "user logged in");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.userId, "123");
  assertEquals(record.msg, "user logged in");
});

Deno.test("logger supports timestamp configuration", () => {
  const withFixedTime = memoryDestination();
  const fixedLog = pequi({
    destination: withFixedTime,
    timestamp: () => 1710000000000,
  });

  fixedLog.info("fixed");
  assertEquals(JSON.parse(withFixedTime.lines[0]).time, 1710000000000);

  const withoutTime = memoryDestination();
  const noTimeLog = pequi({
    destination: withoutTime,
    timestamp: false,
  });

  noTimeLog.info("without time");
  assertEquals("time" in JSON.parse(withoutTime.lines[0]), false);
});
