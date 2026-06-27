import { assertEquals } from "@std/assert";
import defaultPequi, { pequi, pino } from "../../mod.ts";
import { createCaptureDestination } from "./oracle/capture.ts";

Deno.test("factory supports pequi()", () => {
  const log = pequi({ base: null, timestamp: false });
  assertEquals(typeof log.info, "function");
});

Deno.test("factory supports pequi(options)", () => {
  const capture = createCaptureDestination();
  const log = pequi({ base: null, timestamp: false, destination: capture });

  log.info("hello");

  assertEquals(capture.records(), [{ level: 30, msg: "hello" }]);
});

Deno.test("factory supports pequi(destination)", () => {
  const capture = createCaptureDestination();
  const log = pequi(capture);

  log.info("hello");

  assertEquals(capture.records()[0].msg, "hello");
});

Deno.test("factory supports pequi(options, destination)", () => {
  const capture = createCaptureDestination();
  const log = pequi({ base: null, timestamp: false }, capture);

  log.info("hello");

  assertEquals(capture.records(), [{ level: 30, msg: "hello" }]);
});

Deno.test("default export and pino alias behave like the factory", () => {
  assertEquals(defaultPequi, pequi);
  assertEquals(pino, pequi);
});
