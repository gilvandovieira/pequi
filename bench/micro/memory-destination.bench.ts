import { pequi } from "../../mod.ts";
import { memorySink, resetMemorySink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  base: null,
  timestamp: false,
  destination: memorySink,
});

Deno.bench("memory destination write", () => {
  log.info("memory");
  resetMemorySink();
});
