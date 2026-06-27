import { pequi } from "../../mod.ts";
import { memorySink, resetMemorySink } from "../fixtures/sinks.ts";

const log = pequi({
  level: "info",
  destination: memorySink,
});

Deno.bench("memory sink", () => {
  log.info({ index: memorySink.lines.length }, "memory");
  resetMemorySink();
});
