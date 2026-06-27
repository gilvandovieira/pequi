import { registerLogBenchmark } from "./harness.ts";
import { errorObject } from "./payloads.ts";

registerLogBenchmark({
  group: "error-object: error only",
  name: "error precreated error object",
  run(logger): void {
    logger.error(errorObject);
  },
});

registerLogBenchmark({
  group: "error-object: error with message",
  name: "error precreated error object with message",
  run(logger): void {
    logger.error(errorObject, "request failed");
  },
});

registerLogBenchmark({
  group: "error-object: object err with message",
  name: "error object err field with message",
  run(logger): void {
    logger.error({ err: errorObject }, "request failed");
  },
});

registerLogBenchmark({
  group: "error-object: allocation included",
  name: "error new Error allocation included",
  run(logger): void {
    logger.error(new Error("boom"), "request failed");
  },
});
