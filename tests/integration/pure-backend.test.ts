import { assertEquals } from "@std/assert";
import { createPureBackend } from "../../src/backends/pure.ts";
import { memoryDestination } from "../../mod.ts";

Deno.test("pure backend writes newline-delimited lines", () => {
  const destination = memoryDestination();
  const backend = createPureBackend({ destination });

  backend.write('{"level":30}');
  backend.flush();
  backend.close();

  assertEquals(destination.lines, ['{"level":30}\n']);
});
