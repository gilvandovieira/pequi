import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  destination: discardSink,
});

Deno.bench("burst logging throughput", () => {
  for (let index = 0; index < 100; index += 1) {
    log.info({ index }, "burst");
  }
});
