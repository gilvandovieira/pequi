import type { Logger } from "../../mod.ts";
import {
  assertDisabledLoggerDoesNotThrow,
  createPequiNativeLogger,
  createPequiPureLogger,
  nativeAvailable,
} from "./helpers.ts";

const hasNative = nativeAvailable();

registerLoggerCase("string message", (log) => log.info("hello"));
registerLoggerCase("object message", (log) => log.info({ value: 42 }, "object"));
registerLoggerCase("child logger", (log) => log.child({ module: "api" }).info("child"));
registerLoggerCase("error object", (log) => log.error(new Error("boom"), "failed"));
registerLoggerCase(
  "serializer",
  (log) => log.info({ user: { id: "u1", secret: "hidden" } }, "serialized"),
  {
    serializers: {
      user(value) {
        return typeof value === "object" && value !== null
          ? { id: (value as { id?: unknown }).id }
          : value;
      },
    },
  },
);
registerLoggerCase(
  "redaction",
  (log) => log.info({ password: "secret" }, "redacted"),
  { redact: ["password"] },
);

function registerLoggerCase(
  name: string,
  run: (log: Logger) => void,
  options: Parameters<typeof createPequiPureLogger>[0] = {},
): void {
  const pure = createPequiPureLogger(options);
  run(pure);
  assertDisabledLoggerDoesNotThrow(createPequiPureLogger(options));

  const native = hasNative ? createPequiNativeLogger(options) : undefined;
  if (native !== undefined) {
    run(native);
    assertDisabledLoggerDoesNotThrow(createPequiNativeLogger(options));
  }

  Deno.bench({
    name: `pequi-pure ${name}`,
    group: `native-vs-pure: ${name}`,
    baseline: true,
    fn(): void {
      run(pure);
    },
  });

  Deno.bench({
    name: `pequi-native ${name}`,
    group: `native-vs-pure: ${name}`,
    ignore: native === undefined,
    fn(): void {
      if (native !== undefined) {
        run(native);
      }
    },
  });
}
