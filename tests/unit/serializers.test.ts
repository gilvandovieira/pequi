import { assertEquals } from "@std/assert";
import { memoryDestination, pequi } from "../../mod.ts";

Deno.test("serializers transform matching record keys", () => {
  const destination = memoryDestination();
  const log = pequi({
    destination,
    serializers: {
      user(value) {
        if (typeof value !== "object" || value === null) {
          return value;
        }
        return { id: (value as { id?: unknown }).id };
      },
    },
  });

  log.info({ user: { id: "u-1", password: "secret" } }, "user loaded");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.user, { id: "u-1" });
});

Deno.test("error values inside records are serialized", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.error({ err: new Error("boom") }, "failed");

  const record = JSON.parse(destination.lines[0]);
  assertEquals(record.err.type, "Error");
  assertEquals(record.err.message, "boom");
});
