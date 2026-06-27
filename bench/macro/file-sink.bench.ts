import { fileDestination, pequi } from "../../mod.ts";

const path = await Deno.makeTempFile({ prefix: "pequi-bench-", suffix: ".log" });
const log = pequi({
  level: "info",
  destination: fileDestination(path, { append: false }),
});

Deno.bench("file sink", () => {
  log.info("file sink record");
});

globalThis.addEventListener("unload", () => {
  log.flush();
  Deno.removeSync(path);
});
