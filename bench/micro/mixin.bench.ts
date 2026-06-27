import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
  mixin() {
    return { requestId: "req-123" };
  },
});

Deno.bench("pure mixin overhead", () => {
  log.info({ userId: "123" }, "mixed");
});
