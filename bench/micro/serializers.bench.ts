import { pequi } from "../../mod.ts";
import { discardSink } from "../fixtures/sinks.ts";

const user = {
  id: "user-123",
  email: "user@example.test",
  password: "secret",
};

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
});

Deno.bench("pure serializer overhead", () => {
  log.info({ user }, "created user");
});
