import { assertEquals, assertNotStrictEquals } from "@std/assert";
import { copyBindings, createBaseBindings, mergeBindings } from "../../mod.ts";

Deno.test("createBaseBindings includes base and name", () => {
  assertEquals(
    createBaseBindings({
      name: "api",
      base: { service: "api" },
    }),
    {
      service: "api",
      name: "api",
    },
  );
});

Deno.test("createBaseBindings supports disabled base", () => {
  assertEquals(
    createBaseBindings({
      name: "api",
      base: false,
    }),
    {
      name: "api",
    },
  );
});

Deno.test("mergeBindings lets child bindings override parent keys", () => {
  assertEquals(mergeBindings({ service: "api", module: "root" }, { module: "auth" }), {
    service: "api",
    module: "auth",
  });
});

Deno.test("copyBindings returns a defensive copy", () => {
  const source = { service: "api" };
  const copy = copyBindings(source);

  assertEquals(copy, source);
  assertNotStrictEquals(copy, source);
});
