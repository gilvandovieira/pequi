# Compatibility

Pequi targets Pino's documented public API shape incrementally. The compatibility oracle in
`tests/compat/oracle/` is pinned to `npm:pino@10.3.1` and is used only from tests, not from Pequi's
runtime API.

## Implemented

- Factory forms: `pequi()`, `pequi(options)`, `pequi(destination)`, and
  `pequi(options, destination)`.
- Default export and named `pequi` export point to the same factory.
- Core level methods: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, and `silent`.
- Pino core levels, `level`, `levelVal`, `levels`, and `isLevelEnabled`.
- Mutable level with `level-change` events.
- `customLevels` with generated per-level methods, merged `levels.values`/`levels.labels`, and child
  inheritance.
- `useOnlyCustomLevels` (drops the core methods and requires the active level to be custom).
- `levelComparison` as `"ASC"`, `"DESC"`, and a custom `(candidate, active) => boolean` comparator.
- Common log argument forms, including format strings, object plus message, and Error plus message.
- Message format tokens following Pino's `quick-format-unescaped`: `%s`, `%d`/`%f` (`Number`), `%i`
  (`Math.floor`), `%j`/`%o`/`%O` (circular-safe JSON), and `%%`. `%c` and unknown tokens stay
  literal, and leftover arguments are dropped rather than appended.
- Child loggers, nested child bindings, independent child level mutation, and child `msgPrefix`.
- `bindings()` and `setBindings()`.
- `enabled: false`.
- `messageKey`, `errorKey`, `nestedKey`, `msgPrefix`, `timestamp`, and `crlf`.
- `stdTimeFunctions.epochTime` and `stdTimeFunctions.isoTime`.
- Synchronous serializers by top-level key.
- `stdSerializers.err` and `stdSerializers.errWithCause`.
- Structured error serialization with `type`, `message`, `stack`, and `cause`.
- Redaction: dot paths, wildcards (`a.*`, `*.b`, `a.*.c`), array and bracket access (`a[0]`,
  `a[*]`), quoted keys (`a["x.y"]`), censor string, the `(value, path[]) => unknown` censor function
  (path is an array of string segments, as in Pino), and `remove`. `level` and `time` are never
  redacted, matching Pino.
- `formatters.level`, `formatters.bindings`, and `formatters.log`.
- `mixin` and `mixinMergeStrategy`.
- `hooks.logMethod`.
- Minimal `destination()` helper and Pino-style write destinations.
- `multistream` fan-out to multiple destinations, each filtered by its own level, including
  `dedupe`.
- `onChild` as a root option that fires for every descendant child, matching Pino.
- Circular-safe JSON encoding: circular references render as `"[Circular]"` instead of throwing,
  preserving insertion order to match Pino's line output.
- `BigInt` (numeric literal), non-finite numbers (`null`), `toJSON`, and dropped
  `undefined`/function/symbol values, all matching `JSON.stringify` and Pino.
- Opt-in `depthLimit` and `edgeLimit` truncation using `safe-stable-stringify` tokens (`"[Object]"`,
  `"[Array]"`, and `"N items not stringified"`); both default to no limit, matching Pino's
  observable output.
- Native backend selection (`native: false`, `native: "auto"`, and `native: "required"`) does not
  change logger API semantics. Compatibility is regression-tested against pure TypeScript and the
  Rust native writer where native is available.

## Planned

- Destination parity with Pino internals (`sync`, `minLength`, flush-on-exit).
- `stdSerializers.req` and `stdSerializers.res` (deferred: their output is tightly coupled to Node's
  `http` request/response internals, so faithful parity needs real
  `IncomingMessage`/`ServerResponse` fixtures rather than plain objects).

## Bundle Equivalence

The source implementation is the compatibility source of truth. The Rolldown bundle must produce
equivalent output to source for the compatibility fixture suite and must not change Pino-compatible
behavior.

If bundled output diverges from source, the bundle export must be blocked until the divergence is
fixed.

Bundle compatibility checks include:

- Source vs bundle simple message.
- Object plus message.
- Formatted message.
- Error object.
- Child logger.
- Serializer.
- Redaction.
- Formatter.
- Mixin.
- `hooks.logMethod`.
- `messageKey`.
- `errorKey`.
- `nestedKey`.
- `timestamp: false`.

## Intentionally Different

- Pino's Node worker transport model is not part of Pequi core.
- Pino destination internals based on SonicBoom are not copied.
- Node-only runtime details may differ under Deno.
- The Rust native backend does not own Pino compatibility. It receives already encoded JSON lines
  from TypeScript and must produce equivalent output to the pure TypeScript backend.
- The `safe` option is accepted but inert: Pequi is always circular-safe, matching the observable
  behavior of Pino 10.3.1 where `safe: false` still does not throw on circular references.
- When a child adds its own `customLevels`, Pequi merges them with the parent's custom levels so
  inherited custom-level methods keep working. Pino 10.3.1 instead replaces the child level set,
  which makes inherited custom-level methods emit a broken `undefined,...` line; Pequi does not
  reproduce that bug.
- Redaction paths are matched at log time rather than compiled and validated up front, so Pequi is
  more lenient than `fast-redact`: paths that Pino would reject at construction may simply match
  nothing in Pequi. Output for valid paths is identical.
- Message formatting follows Pino's `quick-format-unescaped`, not Node's `util.format`: `%c` is not
  a token and leftover arguments are dropped instead of appended.
- The wildcard serializer key (`*`) is not implemented because it is inert in Pino 10.3.1, where a
  `*` serializer has no effect on the logged object.
- `transport` is not implemented: `pequi.transport` throws a clear error rather than spawning Pino's
  Node worker-thread transport, which is outside the Deno-first core.
- The `browser` option is accepted but not implemented; Pino's browser console mode is out of scope
  for the Deno-first core.

## Test Oracle Permissions

Normal tests still do not require `--allow-ffi`. The Pino oracle itself requires Pino's transitive
module-load access to `NODE_V8_COVERAGE` and `hostname`, so `deno task test` grants only:

```sh
--allow-env=NODE_V8_COVERAGE --allow-sys=hostname
```
