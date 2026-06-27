import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: discardSink,
  serializers: {
    user(value) {
      return { id: (value as { id: string }).id };
    },
  },
  redact: ["password"],
});

Deno.bench("pure disabled level", () => {
  log.debug({ user: { id: "1" }, password: "secret" }, "not emitted");
});
