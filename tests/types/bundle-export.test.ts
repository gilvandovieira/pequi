import pequiDefault, {
  discardDestination,
  type Logger,
  type LoggerOptions,
  pequi,
} from "@pequi/log/bundle";

Deno.test("bundle export exposes logger types", () => {
  const options: LoggerOptions = {
    level: "debug",
    timestamp: false,
    base: null,
    native: false,
    destination: discardDestination(),
  };

  const namedLogger: Logger = pequi(options);
  const defaultLogger: Logger = pequiDefault({ ...options, level: "info" });

  namedLogger.debug({ value: 1 }, "typed %s", "message");
  defaultLogger.info("typed bundle import");
  namedLogger.child({ module: "types" }).warn("child logger");
  namedLogger.flush();
});
