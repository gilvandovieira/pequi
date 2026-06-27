import { assertEquals, assertStrictEquals } from "@std/assert";
import { type Logger, pequi } from "../../mod.ts";

Deno.test("onChild fires for every descendant child, matching Pino", () => {
  const created: Logger[] = [];
  const log = pequi({ base: null, timestamp: false, onChild: (child) => created.push(child) });

  const c1 = log.child({ a: 1 });
  const c2 = c1.child({ b: 2 });

  assertEquals(created.length, 2);
  assertStrictEquals(created[0], c1);
  assertStrictEquals(created[1], c2);
});

Deno.test("a per-call onChild applies to that child's subtree", () => {
  const created: Logger[] = [];
  const log = pequi({ base: null, timestamp: false });

  const c1 = log.child({ a: 1 }, { onChild: (child) => created.push(child) });
  c1.child({ b: 2 });

  assertEquals(created.length, 2);
  assertStrictEquals(created[0], c1);
});
