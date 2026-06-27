import { registerLogBenchmark } from "./harness.ts";
import { redactionObject } from "./payloads.ts";

registerLogBenchmark({
  group: "redaction: top-level paths",
  name: "info redacted top-level payload",
  options: { redact: ["password", "token"] },
  run(logger): void {
    logger.info(redactionObject, "redacted payload");
  },
});

registerLogBenchmark({
  group: "redaction: nested path",
  name: "info redacted nested payload",
  options: { redact: ["password", "token", "nested.password"] },
  run(logger): void {
    logger.info(redactionObject, "redacted payload");
  },
});
