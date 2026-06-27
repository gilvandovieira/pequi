import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  destination: discardSink,
});

Deno.bench("stdout sink placeholder without terminal noise", () => {
  log.info("stdout sink record");
});
