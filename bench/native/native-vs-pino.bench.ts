import type { Logger } from "../../mod.ts";
import { createPinoDeno, type LoggerFactoryOptions } from "../compare/factories.ts";
import { createPequiNativeLogger, createPequiPureLogger, nativeAvailable } from "./helpers.ts";

const hasNative = nativeAvailable();

registerPinoComparison("string message", (log) => log.info("hello"));
registerPinoComparison("object message", (log) => log.info({ value: 42 }, "object"));
registerPinoComparison("error object", (log) => log.error(new Error("boom"), "failed"));
registerPinoComparison(
  "serializer",
  (log) => log.info({ user: { id: "u1", secret: "hidden" } }, "serialized"),
  {
    serializers: {
      user(value: unknown) {
        return typeof value === "object" && value !== null
          ? { id: (value as { id?: unknown }).id }
          : value;
      },
    },
  },
);
registerPinoComparison(
  "redaction",
  (log) => log.info({ password: "secret" }, "redacted"),
  { redact: ["password"] },
);

function registerPinoComparison(
  name: string,
  run: (log: Pick<Logger, "info" | "error">) => void,
  options: LoggerFactoryOptions = {},
): void {
  const pure = createPequiPureLogger(options);
  const native = hasNative ? createPequiNativeLogger(options) : undefined;
  const pino = createPinoDeno(options);

  run(pure);
  if (native !== undefined) {
    run(native);
  }
  run(pino.logger);
  pino.reset();

  Deno.bench({
    name: `pequi-pure ${name}`,
    group: `native-vs-pino: ${name}`,
    baseline: true,
    fn(): void {
      run(pure);
    },
  });

  Deno.bench({
    name: `pequi-native ${name}`,
    group: `native-vs-pino: ${name}`,
    ignore: native === undefined,
    fn(): void {
      if (native !== undefined) {
        run(native);
      }
    },
  });

  Deno.bench({
    name: `pino-deno ${name}`,
    group: `native-vs-pino: ${name}`,
    fn(): void {
      run(pino.logger);
    },
  });
}
