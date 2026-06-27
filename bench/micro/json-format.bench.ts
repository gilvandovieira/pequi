import { formatJsonLine } from "../../mod.ts";
import { smallObjectPayload } from "../fixtures/payloads.ts";

const record = {
  level: 30,
  time: 1710000000000,
  name: "api",
  msg: "request completed",
  ...smallObjectPayload,
};

Deno.bench("format-only json line", () => {
  formatJsonLine(record);
});
