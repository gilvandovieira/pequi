import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
}).child({ reqId: "req-123", service: "api" });

Deno.bench("pure child bindings", () => {
  log.info("request completed");
});
