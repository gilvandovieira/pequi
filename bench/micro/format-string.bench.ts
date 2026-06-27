import { formatMessage } from "../../mod.ts";

Deno.bench("format string interpolation", () => {
  formatMessage("hello %s %d %j %o", ["world", 2, { ok: true }, { nested: true }]);
});
