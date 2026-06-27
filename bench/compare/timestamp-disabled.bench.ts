import { registerLogBenchmark } from "./harness.ts";

registerLogBenchmark({
  group: "timestamp-disabled: info string",
  name: "info string timestamp false",
  options: { timestamp: false },
  run(logger): void {
    logger.info("message");
  },
});
