import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
  formatters: {
    level(label) {
      return { level: label };
    },
    log(object) {
      return { ...object, formatted: true };
    },
  },
});

Deno.bench("pure formatters overhead", () => {
  log.info({ userId: "123" }, "formatted");
});
