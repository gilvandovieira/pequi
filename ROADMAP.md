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

### Phase C2 — Custom Levels — Shipped

`customLevels`, `useOnlyCustomLevels`, and `levelComparison` were typed in `LoggerOptions` but never
read, so they silently no-op. They are now real.

- Done: `src/levels.ts` adds `buildLevelRegistry`, a per-logger level set carried on `LoggerState`;
  `createLogger` generates a log method per custom level on the logger and its children.
- Done: `levels.values`, `levels.labels`, `levelVal`, the `level` setter, and `isLevelEnabled` all
  resolve through the registry.
- Done: `useOnlyCustomLevels` drops the core methods and validates the active level via
  `assertLevelConfigured` (matching Pino's `default level:X must be included in custom levels`).
- Done: `levelComparison` resolves `"ASC"`, `"DESC"`, and a custom `(candidate, active) => boolean`
  comparator, used by both `isLevelEnabled` and log-method gating.
- Done: `child()` merges parent and child custom levels and propagates comparison. Unlike Pino
  10.3.1, a child that adds custom levels keeps inherited custom-level methods working instead of
  emitting a broken `undefined,...` line (see COMPATIBILITY.md).
- Acceptance met: factory, `useOnlyCustomLevels`, `DESC`, and child fixtures match the oracle
  (`tests/compat/custom-levels.test.ts`, `tests/unit/custom-levels.test.ts`).

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

## v0.3 — Rust FFI Skeleton and Native Writer Alpha

- Rust `cdylib`.
- `Deno.dlopen` loader.
- ABI version check.
- `linux-x86_64-gnu` host build first.
- Discard, stdout, stderr, and file destinations.
- Write, flush, and drop ABI.
- Native mode `auto`, `required`, and `false`.
- Native integration tests.
- Native writer benchmarks.

## v0.4 — Linux ARM64 Release Hardening

- `linux-aarch64-gnu` release build.
- CI matrix.
- Binary stripping.
- Release artifact validation.
- Memory stability tests.

## v0.5 — Buffered Writer Tuning

- Tune default buffer sizing per destination.
- Measure stdout, stderr, file, and discard overhead separately.
- Add long-running flush and drop stress tests.
- Keep disabled-level logging entirely TypeScript.

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
