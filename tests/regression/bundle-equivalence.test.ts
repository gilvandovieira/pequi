import { assert } from "@std/assert";
import { loadVariant, resolveDefaultNativeLibraryPath } from "../../bench/bundle/factories.ts";
import { runSemanticEquivalence } from "../../bench/bundle/runner.ts";

Deno.test("bundle output remains semantically equivalent to source", async () => {
  const bundled = await loadVariant("bundled-pure");
  const result = await runSemanticEquivalence(bundled, resolveDefaultNativeLibraryPath());

  assert(
    result.ok,
    result.cases
      .filter((testCase) => !testCase.ok)
      .map((testCase) => `${testCase.name}: ${testCase.reason ?? "failed"}`)
      .join("\n"),
  );
});
