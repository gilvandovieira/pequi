import { assert, assertEquals } from "@std/assert";
import {
  type BenchmarkSubject,
  type ComparableLogger,
  createComparisonSubjects,
  type LoggerFactoryOptions,
} from "./factories.ts";
import { parseJsonLines } from "./normalize.ts";
import type { MemoryBenchmarkSink } from "./sinks.ts";

export interface LogBenchmarkCase {
  group: string;
  name: string;
  options?: Omit<LoggerFactoryOptions, "sink">;
  expectedWrites?: number;
  run(logger: ComparableLogger): void;
}

export function registerLogBenchmark(benchCase: LogBenchmarkCase): void {
  for (const subject of createComparisonSubjects(benchCase.options)) {
    assertWrites(subject, benchCase.expectedWrites ?? 1, () => benchCase.run(subject.logger));

    Deno.bench({
      name: `${subject.name} ${benchCase.name}`,
      group: benchCase.group,
      baseline: subject.name === "pequi-pure",
      fn(): void {
        benchCase.run(subject.logger);
      },
    });
  }
}

export function assertWrites(
  subject: BenchmarkSubject,
  expectedWrites: number,
  run: () => void,
): void {
  subject.reset();
  run();
  assertEquals(
    subject.sink.stats().writes,
    expectedWrites,
    `${subject.name} write count`,
  );
  subject.reset();
}

export function assertOneJsonLine(
  subject: BenchmarkSubject & { sink: MemoryBenchmarkSink },
  run: (logger: ComparableLogger) => void,
): void {
  subject.reset();
  run(subject.logger);
  const lines = subject.sink.lines();
  assertEquals(lines.length, 1, `${subject.name} JSON line count`);
  const records = parseJsonLines(lines);
  assert(records.length === 1, `${subject.name} should emit one parseable JSON record`);
  subject.reset();
}

export function isMemorySink(sink: BenchmarkSubject["sink"]): sink is MemoryBenchmarkSink {
  return typeof (sink as { lines?: unknown }).lines === "function";
}

export function benchWithMeasuredBody(
  subject: BenchmarkSubject,
  group: string,
  name: string,
  expectedWrites: number,
  run: (logger: ComparableLogger) => void,
): void {
  assertWrites(subject, expectedWrites, () => run(subject.logger));

  Deno.bench({
    name: `${subject.name} ${name}`,
    group,
    baseline: subject.name === "pequi-pure",
    fn(b: Deno.BenchContext): void {
      subject.reset();
      b.start();
      run(subject.logger);
      b.end();
      assertEquals(subject.sink.stats().writes, expectedWrites, `${subject.name} write count`);
      subject.reset();
    },
  });
}
