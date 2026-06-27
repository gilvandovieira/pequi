import { createComparisonSubjects } from "./factories.ts";
import { benchWithMeasuredBody } from "./harness.ts";
import { smallObject } from "./payloads.ts";

const burstLogLines = 1_000;

for (const subject of createComparisonSubjects()) {
  benchWithMeasuredBody(
    subject,
    "burst-logging: 1000 small object lines",
    `info ${burstLogLines} small object lines`,
    burstLogLines,
    (logger) => {
      for (let index = 0; index < burstLogLines; index += 1) {
        logger.info(smallObject, "burst message");
      }
    },
  );
}
