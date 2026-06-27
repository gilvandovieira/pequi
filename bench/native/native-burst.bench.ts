import {
  assertFileOutputCount,
  createNativeDiscardBackend,
  createNativeFileBackend,
  createPureDiscardBackend,
  createPureFileBackend,
  nativeAvailable,
  runFileBench,
  writeBackendBurst,
} from "./helpers.ts";

const hasNative = nativeAvailable();
const pureDiscard = createPureDiscardBackend();
const nativeDiscard = hasNative ? createNativeDiscardBackend() : undefined;
const counts = [1_000, 10_000] as const;

assertFileOutputCount(createPureFileBackend, 2);
if (hasNative) {
  assertFileOutputCount(createNativeFileBackend, 2);
}

for (const count of counts) {
  Deno.bench({
    name: `pequi-pure discard ${count} already-formatted lines`,
    group: `native-burst: discard ${count}`,
    baseline: true,
    fn(): void {
      writeBackendBurst(pureDiscard, count);
    },
  });

  Deno.bench({
    name: `pequi-native discard ${count} already-formatted lines`,
    group: `native-burst: discard ${count}`,
    ignore: nativeDiscard === undefined,
    fn(): void {
      if (nativeDiscard !== undefined) {
        writeBackendBurst(nativeDiscard, count);
      }
    },
  });

  Deno.bench({
    name: `pequi-pure file ${count} already-formatted lines`,
    group: `native-burst: file ${count}`,
    baseline: true,
    fn(context): void {
      runFileBench(context, createPureFileBackend, count);
    },
  });

  Deno.bench({
    name: `pequi-native file ${count} already-formatted lines`,
    group: `native-burst: file ${count}`,
    ignore: !hasNative,
    fn(context): void {
      runFileBench(context, createNativeFileBackend, count);
    },
  });
}

globalThis.addEventListener("unload", () => {
  pureDiscard.close();
  nativeDiscard?.close();
});
