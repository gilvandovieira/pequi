import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";
import { parsePath } from "../../src/redaction.ts";

Deno.test("parsePath handles dot, bracket, quoted, and wildcard syntax", () => {
  assertEquals(parsePath("a.b.c"), ["a", "b", "c"]);
  assertEquals(parsePath("a[0].b"), ["a", "0", "b"]);
  assertEquals(parsePath("a[*].b"), ["a", "*", "b"]);
  assertEquals(parsePath("*.secret"), ["*", "secret"]);
  assertEquals(parsePath('meta["x.y"]'), ["meta", "x.y"]);
  assertEquals(parsePath("*"), ["*"]);
});

Deno.test("wildcard paths redact every matching key", () => {
  const destination = memoryDestination();
  const log = pequi({ destination, timestamp: false, base: null, redact: ["creds.*", "*.secret"] });

  log.info({ creds: { user: "u", pass: "p" }, a: { secret: "s", keep: 1 } }, "m");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.creds, { user: "[Redacted]", pass: "[Redacted]" });
  assertEquals(record.a, { secret: "[Redacted]", keep: 1 });
});

Deno.test("array index and wildcard paths redact elements", () => {
  const destination = memoryDestination();
  const log = pequi({ destination, timestamp: false, base: null, redact: ["m[1]", "items[*].t"] });

  log.info({ m: [10, 20, 30], items: [{ t: "a" }, { t: "b" }] }, "m");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.m, [10, "[Redacted]", 30]);
  assertEquals(record.items, [{ t: "[Redacted]" }, { t: "[Redacted]" }]);
});

Deno.test("level and time are immune to redaction", () => {
  const destination = memoryDestination();
  const log = pequi({ destination, base: null, redact: ["*", "level", "time"] });

  log.info({ a: 1 }, "m");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.level, 30);
  assertEquals(typeof record.time, "number");
  assertEquals(record.a, "[Redacted]");
  assertEquals(record.msg, "[Redacted]");
});

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
