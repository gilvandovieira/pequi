import { stdoutDestination } from "../../mod.ts";
import { tryCreateNativeBackend } from "../../src/backends/native.ts";

const backend = tryCreateNativeBackend({
  mode: "auto",
  destination: stdoutDestination(),
});

Deno.bench({
  name: "native ffi write overhead",
  ignore: backend === undefined,
  fn() {
    backend?.write('{"level":30,"time":0,"msg":"native"}');
  },
});

globalThis.addEventListener("unload", () => {
  backend?.close();
});
