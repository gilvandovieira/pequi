import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  destination: discardSink,
});

Deno.bench("request-like logging", () => {
  log.info({
    reqId: "req-123",
    method: "GET",
    path: "/v1/items",
    statusCode: 200,
    durationMs: 12.4,
  }, "request completed");
});
