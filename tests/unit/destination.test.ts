import { assertEquals, assertStringIncludes } from "@std/assert";
import { discardDestination, fileDestination, memoryDestination, pequi } from "../../mod.ts";

Deno.test("memory destination captures lines", () => {
  const destination = memoryDestination();
  const log = pequi({ destination });

  log.info("captured");

  assertEquals(destination.lines.length, 1);
  assertEquals(JSON.parse(destination.lines[0]).msg, "captured");
});

Deno.test("discard destination drops lines", () => {
  const destination = discardDestination();
  const log = pequi({ destination });

  log.info("dropped");
  log.flush();
});

Deno.test("file destination writes newline-delimited JSON", async () => {
  const path = await Deno.makeTempFile({ prefix: "pequi-", suffix: ".log" });
  try {
    const log = pequi({
      destination: fileDestination(path, { append: false }),
    });

    log.info("file line");
    log.flush();

    const text = await Deno.readTextFile(path);
    assertStringIncludes(text, '"msg":"file line"');
  } finally {
    await Deno.remove(path);
  }
});
