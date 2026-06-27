import { createPequiPure, createPinoDeno } from "./factories.ts";
import { assertOneJsonLine, isMemorySink, registerLogBenchmark } from "./harness.ts";
import { largeObject, mediumObject, smallObject } from "./payloads.ts";
import { createMemorySink } from "./sinks.ts";

for (const createSubject of [createPequiPure, createPinoDeno]) {
  const subject = createSubject({ sink: createMemorySink() });
  if (isMemorySink(subject.sink)) {
    assertOneJsonLine(
      { ...subject, sink: subject.sink },
      (logger) => {
        logger.info(smallObject, "user logged in");
      },
    );
  }
}

registerLogBenchmark({
  group: "enabled-object-message: small object",
  name: "info small object",
  run(logger): void {
    logger.info(smallObject, "user logged in");
  },
});

registerLogBenchmark({
  group: "enabled-object-message: medium object",
  name: "info medium object",
  run(logger): void {
    logger.info(mediumObject, "request completed");
  },
});

registerLogBenchmark({
  group: "enabled-object-message: large object",
  name: "info large object",
  run(logger): void {
    logger.info(largeObject, "large payload");
  },
});
