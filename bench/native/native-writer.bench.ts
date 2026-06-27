import { createPinoDeno } from "../compare/factories.ts";
import {
  assertBackendWritesOnce,
  createNativeDiscardBackend,
  createPureDiscardBackend,
  nativeAvailable,
} from "./helpers.ts";

const hasNative = nativeAvailable();
const pure = createPureDiscardBackend();
const native = hasNative ? createNativeDiscardBackend() : undefined;
const pino = createPinoDeno();

assertBackendWritesOnce(pure);
if (native !== undefined) {
  assertBackendWritesOnce(native);
}
pino.logger.info("guard");
pino.reset();

Deno.bench({
  name: "pequi-pure discard single already-formatted line",
  group: "native-writer: single",
  baseline: true,
  fn(): void {
    pure.write('{"level":30,"msg":"writer"}');
  },
});

Deno.bench({
  name: "pequi-native discard single already-formatted line",
  group: "native-writer: single",
  ignore: native === undefined,
  fn(): void {
    native?.write('{"level":30,"msg":"writer"}');
  },
});

Deno.bench({
  name: "pino-deno discard single logger line",
  group: "native-writer: single",
  fn(): void {
    pino.logger.info("writer");
  },
});

globalThis.addEventListener("unload", () => {
  pure.close();
  native?.close();
});
