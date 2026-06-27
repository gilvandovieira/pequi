import {
  assertFileOutputCount,
  createNativeFileBackend,
  createPureFileBackend,
  nativeAvailable,
  runFileBench,
} from "./helpers.ts";

const hasNative = nativeAvailable();
const counts = [1, 100, 1_000] as const;

assertFileOutputCount(createPureFileBackend, 2);
if (hasNative) {
  assertFileOutputCount(createNativeFileBackend, 2);
}

for (const count of counts) {
  Deno.bench({
    name: `pequi-pure file ${count} already-formatted line${count === 1 ? "" : "s"} with flush`,
    group: `native-file: ${count}`,
    baseline: true,
    fn(context): void {
      runFileBench(context, createPureFileBackend, count);
    },
  });

  Deno.bench({
    name: `pequi-native file ${count} already-formatted line${count === 1 ? "" : "s"} with flush`,
    group: `native-file: ${count}`,
    ignore: !hasNative,
    fn(context): void {
      runFileBench(context, createNativeFileBackend, count);
    },
  });
}
