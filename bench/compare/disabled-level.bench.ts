import { registerLogBenchmark } from "./harness.ts";
import { smallObject } from "./payloads.ts";

registerLogBenchmark({
  group: "disabled-level: string message",
  name: "debug disabled string message",
  expectedWrites: 0,
  run(logger): void {
    logger.debug("disabled message");
  },
});

registerLogBenchmark({
  group: "disabled-level: object message",
  name: "debug disabled object message",
  expectedWrites: 0,
  run(logger): void {
    logger.debug(smallObject, "disabled message");
  },
});
