import { assertEquals } from "@std/assert";
import { multistream, pequi } from "../../mod.ts";

function collector() {
  const lines: string[] = [];
  return {
    write(chunk: string): void {
      lines.push(chunk);
    },
    msgs(): string[] {
      return lines.map((line) => JSON.parse(line).msg as string);
    },
  };
}

Deno.test("multistream fans out to streams filtered by level", () => {
  const a = collector();
  const b = collector();
  const stream = multistream([{ level: "debug", stream: a }, { level: "error", stream: b }]);
  const log = pequi({ base: null, timestamp: false, level: "debug" }, stream);

  log.info("i");
  log.error("e");
  log.debug("d");

  assertEquals(a.msgs(), ["i", "e", "d"]);
  assertEquals(b.msgs(), ["e"]);
});

Deno.test("multistream defaults a stream without a level to info", () => {
  const a = collector();
  const stream = multistream([{ stream: a }]);
  const log = pequi({ base: null, timestamp: false, level: "trace" }, stream);

  log.trace("t");
  log.info("i");
  log.warn("w");

  assertEquals(a.msgs(), ["i", "w"]);
});

Deno.test("multistream dedupe routes each line to a single stream", () => {
  const a = collector();
  const b = collector();
  const stream = multistream(
    [{ level: "info", stream: a }, { level: "error", stream: b }],
    { dedupe: true },
  );
  const log = pequi({ base: null, timestamp: false, level: "info" }, stream);

  log.info("i");
  log.error("e");

  assertEquals(a.msgs(), ["i"]);
  assertEquals(b.msgs(), ["e"]);
});

Deno.test("multistream add appends a stream", () => {
  const a = collector();
  const b = collector();
  const stream = multistream({ level: "info", stream: a });
  stream.add({ level: "error", stream: b });
  const log = pequi({ base: null, timestamp: false }, stream);

  log.info("i");
  log.error("e");

  assertEquals(a.msgs(), ["i", "e"]);
  assertEquals(b.msgs(), ["e"]);
});

Deno.test("pequi.multistream is the same factory as the named export", () => {
  assertEquals(pequi.multistream, multistream);
});
