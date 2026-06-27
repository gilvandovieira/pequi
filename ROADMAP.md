# Roadmap

## Pino Compatibility Roadmap

This section sequences the unimplemented Pino API surface tracked in `COMPATIBILITY.md`. Phases are
ordered by user impact, not by effort. Every phase lands behind oracle fixtures pinned to
`npm:pino@10.3.1`, so "parity" below means byte-equal normalized output against that oracle.

### Phase C1 — Encoder Correctness (drop-in safety) — Shipped

These were the failures that are silent or crash rather than throw a clear error, so they break real
apps that Pino survives. Highest priority.

- Done: `src/encode.ts` provides `safeStableStringify`; `formatJsonLine` uses a fast
  `JSON.stringify` path with a safe fallback (`src/format.ts`).
- Done: circular references render as `"[Circular]"` instead of throwing. The crash actually
  originated in `serializeErrorValues` (`src/serializers.ts`), which now detects cycles via a
  `WeakMap` and no longer flattens `Date`/class instances to `{}`.
- Done: `depthLimit` and `edgeLimit` are threaded from `LoggerOptions` through child loggers,
  default to no limit (matching Pino's observable output), and use `safe-stable-stringify`
  truncation tokens when set.
- Done: insertion order is preserved at every level (Pino does not sort keys), and `toJSON` is
  honored, matching Pino.
- Done: `BigInt` renders as a numeric literal, non-finite numbers as `null`, and
  `undefined`/function/symbol values are dropped, matching `JSON.stringify`.
- Note: `safe` is accepted but inert; Pequi stays circular-safe, matching Pino 10.3.1 where
  `safe: false` also does not throw.
- Acceptance met: oracle fixtures for cyclic objects and non-serializable values match Pino and
  never throw (`tests/compat/encoding.test.ts`, `tests/unit/encode.test.ts`).

### Phase C2 — Custom Levels

Currently `customLevels`, `useOnlyCustomLevels`, and `levelComparison` are typed in `LoggerOptions`
but never read, so they silently no-op. This phase makes them real.

- Generate a log method per custom level and expose it on the logger and its children.
- Merge custom levels into `levels.values`, `levels.labels`, `levelVal`, and `isLevelEnabled`.
- Implement `useOnlyCustomLevels`, including rejecting the core levels when set.
- Implement `levelComparison` for `"ASC"`, `"DESC"`, and the custom comparator function form.
- Propagate custom levels and comparison through `child()`.
- Acceptance: factory, method-generation, comparison, and child-inheritance fixtures match the
  oracle.

### Phase C3 — Redaction Parity

Today only literal dot paths redact; `*.secret` and bracket syntax pass through untouched.

- Wildcard segments: leading (`*.secret`), terminal (`user.*`), and intermediate.
- Bracket and array path syntax (`a[*].b`, `a[0].b`).
- Multiple paths targeting the same subtree, and `remove` plus `censor` interactions.
- Decide between extending the current walker and adopting fast-redact path semantics.
- Acceptance: a redaction fixture set covering wildcard, bracket, and array paths matches the
  oracle.

### Phase C4 — Formatting and Serializer Parity

- Extend `formatMessage` to Node `util.format` tokens `%i`, `%f`, and `%c`, plus missing- and
  extra-argument edge cases.
- Complete `stdSerializers.req` and `stdSerializers.res`.
- Add the wildcard serializer key (`*`) and the request/response serializer wrappers.
- Acceptance: expanded message-argument and serializer fixtures match the oracle.

### Phase C5 — Output Sinks and Advanced Options

The loud "not implemented" surface. Lowest priority because failures are explicit today.

- `transport`: either a Deno-native worker model or a documented intentional difference.
- `multistream`: fan-out to multiple destinations with per-stream levels.
- Destination parity: `sync`, `minLength`, and flush-on-exit semantics.
- `browser` option behavior.
- Full `onChild` semantics beyond the current single callback.
- Acceptance: documented behavior with tests where a Deno-equivalent exists.

### Out of Scope

Carried over from `COMPATIBILITY.md` and not planned for the compatibility layer:

- Pino's Node worker transport model and SonicBoom destination internals.
- Node-only runtime details that cannot be reproduced under Deno.
- The Rust native backend, which is tracked by the release timeline below.

## v0.1 — Pure TypeScript Pino-Shaped Baseline

- Level methods.
- Child loggers.
- Base bindings.
- Name binding.
- Error logging.
- Serializers.
- Top-level redaction.
- JSON line output.
- Memory, discard, stdout, stderr, and file destinations.
- Initial Deno.bench suite.

## v0.2 — Compatibility Expansion

- Deeper Pino argument behavior.
- Better error serialization.
- Serializer edge cases.
- Redaction expansion.
- More compatibility fixtures.
- Benchmark regression script.

## v0.3 — Rust FFI Skeleton

- Rust `cdylib`.
- `Deno.dlopen` loader.
- `linux-x86_64-gnu` first.
- Write, flush, and drop ABI.
- Native mode `auto`, `required`, and `false`.
- FFI overhead benchmark.

## v0.4 — Native Writer Alpha

- Rust buffered sink.
- Stdout, stderr, and file support.
- Burst logging benchmark.
- Flush correctness tests.
- Native fallback tests.

## v0.5 — Linux ARM64

- `linux-aarch64-gnu` build.
- CI matrix.
- Binary stripping.
- Release artifact validation.
- Memory stability tests.

## v0.6 — Encoder Decision

- Benchmark TypeScript `JSON.stringify` plus Rust sink.
- Benchmark possible Rust batch encoding.
- Move encoding into Rust only if real benchmarks justify it.

## v1.0 — Stable Backend Logger

- Stable Pino-compatible API subset.
- Documented compatibility matrix.
- Pure TypeScript backend.
- Official Rust native backend.
- Linux x64 and ARM64 support.
- Benchmark report.
- Migration notes from Pino.
