import { pequi } from "../../mod.ts";
import { createError } from "../fixtures/payloads.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
});

Deno.bench("pure error object", () => {
  log.error(createError(), "request failed");
});
