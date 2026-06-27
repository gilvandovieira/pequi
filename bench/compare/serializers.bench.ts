import type { Serializers } from "../../mod.ts";
import { registerLogBenchmark } from "./harness.ts";
import { serializerObject } from "./payloads.ts";

const serializers: Serializers = {
  user(value) {
    return { id: (value as { id: string }).id };
  },
};

registerLogBenchmark({
  group: "serializers: user field",
  name: "info serialized user field",
  options: { serializers },
  run(logger): void {
    logger.info({ user: serializerObject }, "serialized user");
  },
});
