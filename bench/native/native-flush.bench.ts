import type { Backend } from "../../mod.ts";
import {
  assertFileOutputCount,
  createNativeFileBackend,
  createPureFileBackend,
  nativeAvailable,
  writeBackendBurst,
} from "./helpers.ts";

const hasNative = nativeAvailable();
const writeCounts = [0, 1, 1_000] as const;

assertFileOutputCount(createPureFileBackend, 2);
if (hasNative) {
  assertFileOutputCount(createNativeFileBackend, 2);
}

for (const count of writeCounts) {
  Deno.bench({
    name: `pequi-pure file flush after ${count} write${count === 1 ? "" : "s"}`,
    group: `native-flush: ${count}`,
    baseline: true,
    fn(context): void {
      runFlushBench(context, createPureFileBackend, count);
    },
  });

  Deno.bench({
    name: `pequi-native file flush after ${count} write${count === 1 ? "" : "s"}`,
    group: `native-flush: ${count}`,
    ignore: !hasNative,
    fn(context): void {
      runFlushBench(context, createNativeFileBackend, count);
    },
  });
}

function runFlushBench(
  context: Deno.BenchContext,
  createBackend: (path: string) => Backend,
  count: number,
): void {
  const path = Deno.makeTempFileSync({ prefix: "pequi-native-flush-", suffix: ".log" });
  const backend = createBackend(path);
  try {
    writeBackendBurst(backend, count);
    context.start();
    backend.flush();
    context.end();
  } finally {
    backend.close();
    Deno.removeSync(path);
  }
}
