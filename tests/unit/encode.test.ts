import { assertEquals } from "@std/assert";
import { safeStableStringify } from "../../src/encode.ts";
import { formatJsonLine } from "../../mod.ts";

Deno.test("encoder matches JSON.stringify for serializable values", () => {
  const record = { level: 30, nested: { b: 1, a: 2 }, list: [1, "two", null], msg: "ok" };
  assertEquals(safeStableStringify(record), JSON.stringify(record));
});

Deno.test("encoder preserves insertion order at every level", () => {
  assertEquals(
    safeStableStringify({ z: 1, a: 2, nested: { y: 9, b: 8 } }),
    '{"z":1,"a":2,"nested":{"y":9,"b":8}}',
  );
});

Deno.test("encoder replaces circular references with [Circular]", () => {
  const self: Record<string, unknown> = { name: "x" };
  self.self = self;
  assertEquals(safeStableStringify(self), '{"name":"x","self":"[Circular]"}');
});

Deno.test("encoder renders a shared sibling fully (ancestor-stack detection)", () => {
  const shared = { s: 1 };
  assertEquals(safeStableStringify({ a: shared, b: shared }), '{"a":{"s":1},"b":{"s":1}}');
});

Deno.test("encoder renders BigInt as a numeric literal", () => {
  assertEquals(safeStableStringify({ big: 10n, neg: -7n }), '{"big":10,"neg":-7}');
});

Deno.test("encoder follows JSON.stringify for special values", () => {
  assertEquals(safeStableStringify({ nan: NaN, inf: Infinity }), '{"nan":null,"inf":null}');
  assertEquals(safeStableStringify({ u: undefined, fn: () => 1, nul: null }), '{"nul":null}');
  assertEquals(safeStableStringify({ arr: [undefined, () => 1, 3] }), '{"arr":[null,null,3]}');
});

Deno.test("encoder honors toJSON", () => {
  assertEquals(
    safeStableStringify({ d: { toJSON: () => ({ kept: true }) } }),
    '{"d":{"kept":true}}',
  );
});

Deno.test("depthLimit truncates with safe-stable-stringify tokens", () => {
  assertEquals(
    safeStableStringify({ a: { b: { c: 1 } } }, { depthLimit: 2 }),
    '{"a":{"b":"[Object]"}}',
  );
  assertEquals(safeStableStringify({ root: [[1]] }, { depthLimit: 1 }), '{"root":"[Array]"}');
});

Deno.test("edgeLimit summarizes the remainder with safe-stable-stringify tokens", () => {
  const wide: Record<string, number> = {};
  for (let i = 0; i < 8; i++) wide[`k${i}`] = i;
  assertEquals(
    safeStableStringify(wide, { edgeLimit: 3 }),
    '{"k0":0,"k1":1,"k2":2,"...":"5 items not stringified"}',
  );

  assertEquals(
    safeStableStringify({ arr: [0, 1, 2, 3, 4, 5, 6] }, { edgeLimit: 3 }),
    '{"arr":[0,1,2,"... 3 items not stringified"]}',
  );

  assertEquals(
    safeStableStringify({ arr: [0, 1, 2, 3, 4] }, { edgeLimit: 3 }),
    '{"arr":[0,1,2,"... 1 item not stringified"]}',
  );
});

Deno.test("formatJsonLine never throws on circular references", () => {
  const self: Record<string, unknown> = { level: 30 };
  self.self = self;
  assertEquals(formatJsonLine(self), '{"level":30,"self":"[Circular]"}');
});
