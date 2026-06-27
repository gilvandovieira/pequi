import { registerLogBenchmark } from "./harness.ts";

registerLogBenchmark({
  group: "enabled-string-message: static string",
  name: "info string message",
  run(logger): void {
    logger.info("server started");
  },
});
