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

### Phase C3 — Redaction Parity — Shipped

Previously only literal dot paths redacted; `*.secret` and bracket syntax passed through untouched.

- Done: `src/redaction.ts` adds `parsePath`, supporting wildcards (leading `*.secret`, terminal
  `user.*`, intermediate `a.*.c`), array/bracket access (`a[0]`, `a[*]`), and quoted keys
  (`a["x.y"]`).
- Done: the censor function receives the resolved path as an array of string segments, matching
  Pino; `remove` and the default `"[Redacted]"` censor are preserved.
- Done: `level` and `time` are immune to redaction (even an explicit path or a root `*`), matching
  Pino's prefix handling.
- Done: paths are parsed once at construction (stored on `LoggerState`) instead of per log.
- Bonus: dropped the redundant per-log deep clone (redaction now mutates the already-private
  serialized record), which fixed a latent bug where redaction flattened `Date` values to `{}` and
  cut redaction overhead by roughly a third (top-level 2.12x to 1.43x of Pino, nested 1.68x to
  1.19x).
- Acceptance met: wildcard, bracket, array, `remove`, and censor-path fixtures match the oracle
  (`tests/compat/redaction.test.ts`, `tests/unit/redaction.test.ts`).

### Phase C4 — Formatting and Serializer Parity — Formatting shipped

Pino formats with `quick-format-unescaped`, not Node `util.format`, so the token rules differ from
the original plan (`%c` is not a token; leftover args are dropped, not appended).

- Done: `formatMessage` (`src/format.ts`) is a char scanner matching `quick-format-unescaped`: `%s`,
  `%d`/`%f` (`Number`), `%i` (`Math.floor`), `%j`/`%o`/`%O` (circular-safe via
  `safeStableStringify`), `%%`; `%c` and unknown tokens stay literal; leftover arguments are
  dropped.
- Done: this also closed part of the perf gap (single-placeholder format 2.54x to 1.63x of Pino) and
  fixed a corrected non-Pino test that asserted leftover args were appended.
- Acceptance met for formatting: token and argument-count fixtures match the oracle
  (`tests/compat/message-arguments.test.ts`, `tests/unit/format.test.ts`).

Remaining (deferred):

- The wildcard serializer key (`*`) is inert in Pino 10.3.1, so it is intentionally not implemented
  (documented in COMPATIBILITY.md) rather than diverging.
- `stdSerializers.req`/`res` need real Node `http` request/response fixtures for faithful parity
  (plain mocks yield `statusCode: null`), so they stay in Planned for a focused HTTP-serializer
  pass.

### Phase C5 — Output Sinks and Advanced Options — multistream and onChild shipped

The loud "not implemented" surface. The two items with a clean Deno equivalent are done; the rest
are Node-specific and stay documented differences.

- Done: `src/multistream.ts` provides `multistream` (also `pequi.multistream`) with per-stream level
  filtering and `dedupe`. The level value is plumbed from the log method through `Backend.write` and
  the sink, which sets `lastLevel` on the destination, mirroring Pino.
- Done: `onChild` is now a root option fired for every descendant child (`src/logger.ts`), not just
  a per-`child()` callback.
- Acceptance met: `tests/unit/multistream.test.ts` and `tests/unit/onchild.test.ts` match the
  behavior verified against Pino (broadcast, `dedupe`, default stream level, descendant firing).

Remaining (deferred / intentional differences):

- `transport`: Pino's Node worker-thread model is outside the Deno-first core; `pequi.transport`
  throws a clear error (documented in COMPATIBILITY.md) rather than emulating it.
- `browser`: accepted but not implemented; Pino's browser console mode is out of scope.
- Destination `sync`/`minLength`/flush-on-exit: SonicBoom internals are not copied; revisit if a
  Deno-native buffering story is needed.

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

## v0.4 — Native Integration and Benchmark Hardening

- Native backend resolver.
- Native fallback diagnostics.
- Pure/native equivalence tests.
- Native lifecycle tests.
- Native file flush tests.
- Native benchmark suite.
- Benchmark regression baseline.
- Regression threshold script.

## v0.5 — Linux ARM64 Release Hardening

- `linux-aarch64-gnu` release build.
- CI matrix.
- Binary stripping.
- Release artifact validation.
- Memory stability tests.

## v0.6 — Native Buffering Tuning

- Tune default buffer sizing per destination.
- Measure stdout, stderr, file, and discard overhead separately.
- Add long-running flush and drop stress tests.
- Keep disabled-level logging entirely TypeScript.

## v0.7 — Encoder Decision

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
