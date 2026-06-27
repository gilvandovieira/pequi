import { build, type BuildOptions } from "rolldown";
import normalConfig from "../build/rolldown.config.ts";
import minConfig from "../build/rolldown.min.config.ts";

const configName = Deno.args[0];

if (configName === "normal") {
  await build(normalConfig as BuildOptions);
} else if (configName === "min") {
  await build(minConfig as BuildOptions);
} else {
  throw new Error(`Unknown bundle config: ${configName ?? "(missing)"}`);
}
