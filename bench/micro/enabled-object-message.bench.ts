import { pequi } from "../../mod.ts";
import { smallObjectPayload } from "../fixtures/payloads.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
});

Deno.bench("pure object message", () => {
  log.info(smallObjectPayload, "request completed");
});
