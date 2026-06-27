import { registerLogBenchmark } from "./harness.ts";
import { formatArgs } from "./payloads.ts";

registerLogBenchmark({
  group: "format-string: single string placeholder",
  name: "info format hello string",
  run(logger): void {
    logger.info(formatArgs.hello[0], formatArgs.hello[1]);
  },
});

registerLogBenchmark({
  group: "format-string: string and number placeholders",
  name: "info format request duration",
  run(logger): void {
    logger.info(formatArgs.request[0], formatArgs.request[1], formatArgs.request[2]);
  },
});
