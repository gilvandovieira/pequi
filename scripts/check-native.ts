import { stdoutDestination } from "../mod.ts";
import { createNativeBackend } from "../src/backends/native.ts";

const backend = createNativeBackend({
  mode: "required",
  destination: stdoutDestination(),
});

backend.flush();
backend.close();
console.log("Native backend loaded successfully.");
