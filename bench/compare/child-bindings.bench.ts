import { createComparisonSubjects } from "./factories.ts";
import { assertWrites } from "./harness.ts";
import { smallObject } from "./payloads.ts";

for (const subject of createComparisonSubjects()) {
  const child = subject.logger.child({ module: "auth", requestId: "abc" });

  assertWrites(subject, 1, () => {
    child.info("child message");
  });

  Deno.bench({
    name: `${subject.name} child info string message`,
    group: "child-bindings: string message",
    baseline: subject.name === "pequi-pure",
    fn(): void {
      child.info("child message");
    },
  });
}

for (const subject of createComparisonSubjects()) {
  const child = subject.logger.child({ module: "auth", requestId: "abc" });

  assertWrites(subject, 1, () => {
    child.info(smallObject, "child object message");
  });

  Deno.bench({
    name: `${subject.name} child info object message`,
    group: "child-bindings: object message",
    baseline: subject.name === "pequi-pure",
    fn(): void {
      child.info(smallObject, "child object message");
    },
  });
}
