import { createPequiNativeIfAvailable, createPequiPure, createPinoDeno } from "./factories.ts";
import { benchWithMeasuredBody, isMemorySink } from "./harness.ts";
import { smallObject } from "./payloads.ts";
import { createMemorySink } from "./sinks.ts";

const subjects = [
  createPequiPure({ sink: createMemorySink() }),
  createPinoDeno({ sink: createMemorySink() }),
];

const nativeSubject = createPequiNativeIfAvailable({ sink: createMemorySink() });
if (nativeSubject !== undefined && isMemorySink(nativeSubject.sink)) {
  subjects.push(nativeSubject);
}

const memoryLogLines = 100;

for (const subject of subjects) {
  benchWithMeasuredBody(
    subject,
    "memory-destination: 100 small object lines",
    `info ${memoryLogLines} small object memory sink lines`,
    memoryLogLines,
    (logger) => {
      for (let index = 0; index < memoryLogLines; index += 1) {
        logger.info(smallObject, "memory sink payload");
      }
    },
  );
}
