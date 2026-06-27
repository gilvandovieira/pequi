import { discardDestination, fileDestination } from "../../mod.ts";
import type { Backend } from "../../mod.ts";
import { createNativeBackend, tryCreateNativeBackend } from "../../src/backends/native.ts";
import { createPureBackend } from "../../src/backends/pure.ts";
import { createPinoDeno } from "./factories.ts";
import { createDiscardSink } from "./sinks.ts";

const line = '{"level":30,"msg":"native writer benchmark"}';
const burstSizes = [1_000, 10_000] as const;
const cleanup: Array<() => void> = [];

const pureDiscard = createPureBackend({ destination: discardDestination() });
const nativeDiscard = tryCreateNativeBackend({
  mode: "auto",
  destination: discardDestination(),
  bufferSize: 64 * 1024,
});
const pinoDiscard = createPinoDeno({ sink: createDiscardSink() });

cleanup.push(() => pureDiscard.close());
if (nativeDiscard !== undefined) {
  cleanup.push(() => nativeDiscard.close());
}

registerSingleWriteBench("pequi-pure", pureDiscard);
if (nativeDiscard !== undefined) {
  registerSingleWriteBench("pequi-native", nativeDiscard);
}

for (const burstSize of burstSizes) {
  registerBurstBench("pequi-pure", pureDiscard, burstSize, false);
  registerBurstBench("pequi-pure", pureDiscard, burstSize, true);

  if (nativeDiscard !== undefined) {
    registerBurstBench("pequi-native", nativeDiscard, burstSize, false);
    registerBurstBench("pequi-native", nativeDiscard, burstSize, true);
  }
}

registerFileBurstBench("pequi-pure", (path) =>
  createPureBackend({
    destination: fileDestination(path, { append: false }),
  }));

Deno.bench({
  name: "pequi-native file sink 10000 already-formatted lines",
  group: "native-writer: file burst",
  ignore: nativeDiscard === undefined,
  fn(context): void {
    const path = Deno.makeTempFileSync({ prefix: "pequi-native-writer-", suffix: ".log" });
    const backend = createNativeBackend({
      mode: "required",
      destination: fileDestination(path, { append: false }),
      bufferSize: 64 * 1024,
    });

    try {
      context.start();
      writeBurst(backend, 10_000);
      backend.flush();
      context.end();
    } finally {
      backend.close();
      Deno.removeSync(path);
    }
  },
});

Deno.bench({
  name: "pino-deno comparable discard sink 1000 logger lines",
  group: "native-writer: comparable pino sink",
  fn(): void {
    for (let index = 0; index < 1_000; index += 1) {
      pinoDiscard.logger.info("native writer comparable");
    }
  },
});

globalThis.addEventListener("unload", () => {
  for (const close of cleanup) {
    close();
  }
});

function registerSingleWriteBench(name: string, backend: Backend): void {
  Deno.bench({
    name: `${name} discard single already-formatted line`,
    group: "native-writer: discard single",
    baseline: name === "pequi-pure",
    fn(): void {
      backend.write(line);
    },
  });
}

function registerBurstBench(
  name: string,
  backend: Backend,
  burstSize: 1_000 | 10_000,
  flushAfterBurst: boolean,
): void {
  Deno.bench({
    name: `${name} discard ${burstSize} already-formatted lines${
      flushAfterBurst ? " with flush" : ""
    }`,
    group: flushAfterBurst
      ? `native-writer: discard ${burstSize} burst flush`
      : `native-writer: discard ${burstSize} burst`,
    baseline: name === "pequi-pure",
    fn(): void {
      writeBurst(backend, burstSize);
      if (flushAfterBurst) {
        backend.flush();
      }
    },
  });
}

function registerFileBurstBench(
  name: string,
  createBackend: (path: string) => Backend,
): void {
  Deno.bench({
    name: `${name} file sink 10000 already-formatted lines`,
    group: "native-writer: file burst",
    baseline: name === "pequi-pure",
    fn(context): void {
      const path = Deno.makeTempFileSync({ prefix: "pequi-native-writer-", suffix: ".log" });
      const backend = createBackend(path);

      try {
        context.start();
        writeBurst(backend, 10_000);
        backend.flush();
        context.end();
      } finally {
        backend.close();
        Deno.removeSync(path);
      }
    },
  });
}

function writeBurst(backend: Backend, count: number): void {
  for (let index = 0; index < count; index += 1) {
    backend.write(line);
  }
}
