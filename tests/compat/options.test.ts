import { assertEquals } from "@std/assert";
import { pequi, stdTimeFunctions } from "../../mod.ts";
import { createCaptureDestination } from "./oracle/capture.ts";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "messageKey, errorKey, nestedKey, and enabled false match Pino subset",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: null,
        messageKey: "message",
        errorKey: "error",
        nestedKey: "payload",
      },
      (log) => {
        callMethod(log, "info", { a: 1 }, "hello");
        callMethod(log, "error", new Error("boom"), "failed");
      },
    );

    assertEquals(pequiRecords, pinoRecords);

    const capture = createCaptureDestination();
    const disabled = pequi({ enabled: false, timestamp: false, base: null }, capture);
    disabled.info("hidden");
    assertEquals(capture.records(), []);
  },
});

Deno.test("timestamp false, true, and function are supported", () => {
  const withoutTime = createCaptureDestination();
  pequi({ timestamp: false, base: null }, withoutTime).info("x");
  assertEquals("time" in withoutTime.records()[0], false);

  const withTime = createCaptureDestination();
  pequi({ timestamp: true, base: null }, withTime).info("x");
  assertEquals(typeof withTime.records()[0].time, "number");

  const customTime = createCaptureDestination();
  pequi({ timestamp: () => ',"time":123', base: null }, customTime).info("x");
  assertEquals(customTime.records()[0].time, 123);

  assertEquals(stdTimeFunctions.epochTime().startsWith(',"time":'), true);
  assertEquals(stdTimeFunctions.isoTime().startsWith(',"time":"'), true);
});

Deno.test("crlf true writes CRLF line endings", () => {
  const capture = createCaptureDestination();
  pequi({ timestamp: false, base: null, crlf: true }, capture).info("crlf");

  assertEquals(capture.text().endsWith("\r\n"), true);
});
