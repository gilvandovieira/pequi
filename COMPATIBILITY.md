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
- Child loggers, nested child bindings, independent child level mutation, and child `msgPrefix`.
- `bindings()` and `setBindings()`.
- `enabled: false`.
- `messageKey`, `errorKey`, `nestedKey`, `msgPrefix`, `timestamp`, and `crlf`.
- `stdTimeFunctions.epochTime` and `stdTimeFunctions.isoTime`.
- Synchronous serializers by top-level key.
- `stdSerializers.err` and `stdSerializers.errWithCause`.
- Structured error serialization with `type`, `message`, `stack`, and `cause`.
- Redaction subset: dot paths, censor string, censor function, and `remove`.
- `formatters.level`, `formatters.bindings`, and `formatters.log`.
- `mixin` and `mixinMergeStrategy`.
- `hooks.logMethod`.
- Minimal `destination()` helper and Pino-style write destinations.
- Circular-safe JSON encoding: circular references render as `"[Circular]"` instead of throwing,
  preserving insertion order to match Pino's line output.
- `BigInt` (numeric literal), non-finite numbers (`null`), `toJSON`, and dropped
  `undefined`/function/symbol values, all matching `JSON.stringify` and Pino.
- Opt-in `depthLimit` and `edgeLimit` truncation using `safe-stable-stringify` tokens (`"[Object]"`,
  `"[Array]"`, and `"N items not stringified"`); both default to no limit, matching Pino's
  observable output.

## Planned

- Full fast-redact path syntax.
- Destination parity with Pino internals.
- `transport`.
- `multistream`.
- Complete `stdSerializers.req` and `stdSerializers.res`.
- Exact Node `util.format` parity for less common placeholders.
- Full `onChild` behavior.

## Intentionally Different

- Pino's Node worker transport model is not part of Pequi core.
- Pino destination internals based on SonicBoom are not copied.
- Node-only runtime details may differ under Deno.
- The Rust native backend is outside this compatibility layer and is not part of this task.
- The `safe` option is accepted but inert: Pequi is always circular-safe, matching the observable
  behavior of Pino 10.3.1 where `safe: false` still does not throw on circular references.
- When a child adds its own `customLevels`, Pequi merges them with the parent's custom levels so
  inherited custom-level methods keep working. Pino 10.3.1 instead replaces the child level set,
  which makes inherited custom-level methods emit a broken `undefined,...` line; Pequi does not
  reproduce that bug.

## Test Oracle Permissions

Normal tests still do not require `--allow-ffi`. The Pino oracle itself requires Pino's transitive
module-load access to `NODE_V8_COVERAGE` and `hostname`, so `deno task test` grants only:

```sh
--allow-env=NODE_V8_COVERAGE --allow-sys=hostname
```
