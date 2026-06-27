import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("redaction censors top-level paths", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    redact: ["password", "token"],
  });

  log.info({
    password: "secret",
    token: "token-1",
    user: { id: "u-1", token: "nested-token" },
  }, "created");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.password, "[Redacted]");
  assertEquals(record.token, "[Redacted]");
  assertEquals(record.user.token, "nested-token");
  assertEquals(record.user.id, "u-1");
});

Deno.test("redaction supports a custom censor", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    redact: { paths: ["secret"], censor: "<hidden>" },
  });

  log.info({ secret: "value" });

  assertEquals(JSON.parse(destination.lines[0]).secret, "<hidden>");
});
