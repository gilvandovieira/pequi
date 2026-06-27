import { pequi } from "../../mod.ts";
import { redactionPayload } from "../fixtures/payloads.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
  redact: ["password", "token"],
});

Deno.bench("pure redaction overhead", () => {
  log.info(redactionPayload, "login");
});
