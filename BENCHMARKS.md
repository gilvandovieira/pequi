# Benchmarks

Pequi is benchmark-driven. API compatibility changes require compatibility tests. Hot-path changes
require benchmarks.

The disabled-level path is critical: it must avoid object normalization, formatting, serializers,
redaction, mixins, and destination writes.

## Internal Benchmarks

- Disabled level overhead.
- Enabled string message.
- Enabled object plus message.
- Format-string interpolation.
- Error object logging.
- Child bindings.
- Serializer overhead.
- Redaction overhead.
- Formatter overhead.
- Mixin overhead.
- Memory destination writes.
- Burst logging throughput.

## Benchmark Rules

- Use `Deno.bench`.
- Use discard or memory destinations for microbenchmarks.
- Avoid console writes in hot-path benchmarks.
- Keep benchmarks deterministic.
- Do not claim Pequi is faster than Pino until real reports exist.

## Pino Reference Benchmarks

Pino reference benchmarks should live separately from the default benchmark path. They may import
`npm:pino`, but Pino must not become a runtime dependency of `@pequi/log`.

## Pequi vs Pino comparison

The comparison suite lives in `bench/compare/` and uses `npm:pino@10.3.1` as a benchmark reference,
matching the existing compatibility oracle pin. Pino is not a runtime dependency of `@pequi/log`; it
is imported only by benchmark and compatibility reference code.

The first comparison target is `pino-deno`: npm Pino running under Deno's npm compatibility layer.
This is intentionally not the same measurement as Node-native Pino. A future `pino-node` comparison
can be added separately if needed.

Most comparison benchmarks use `timestamp: false`, `base: null`, `messageKey: "msg"`, and
`errorKey: "err"` to avoid measuring volatile runtime fields such as time, pid, and hostname. They
also use discard sinks by default so terminal I/O does not dominate the result.

Interpret results per workload, not as a global winner. Disabled-level overhead is the first
critical microbenchmark because disabled logging should avoid formatting, serialization, redaction,
and writes. Enabled object logging, format strings, error objects, serializers, redaction, child
bindings, memory destinations, and burst logging are separate cost centers.

Run the Deno comparison with:

```sh
deno task bench:compare
```

Run the optional native attempt with:

```sh
deno task bench:compare:native
```

## Native Rust Writer Benchmarks

The native Rust backend currently accelerates only the write and flush path. TypeScript still owns
Pino-compatible behavior, level checks, bindings, serializers, redaction, message formatting, and
JSON line encoding.

Disabled-level logging remains entirely TypeScript and should not call native code. Native is not
expected to improve that benchmark.

`bench/native/` measures already formatted JSON line writes, file writes, burst logging, flush
costs, Pequi pure vs native logger paths, and Pequi native vs Pino under Deno. The Pino reference is
a comparable Deno sink/logger reference, not an already-encoded writer API.

Interpret native wins by workload. FFI overhead can dominate tiny one-line discard writes, while the
native writer is expected to matter more for burst logging, buffered file writes, stdout/stderr
writes, and high-volume backend workloads. Rust JSON encoding is a future decision and is not part
of the current benchmark.

Run native benchmarks with:

```sh
deno task bench:native
```

Collect native comparison JSON for regression checks with:

```sh
deno task bench:native:compare
```

Update the baseline with:

```sh
deno run --allow-read --allow-write --allow-run scripts/update-baseline.ts \
  bench/reports/native-current.json bench/regression/baseline.json
```

Regression checks compare matching benchmark names from `bench/regression/baseline.json` and
`bench/reports/native-current.json`. Tiny noise should not fail CI: disabled-level benchmarks use a
10% hard threshold, format-only benchmarks use 15%, and native burst/file benchmarks use 20% once a
baseline exists. Pure-vs-native integration and memory/RSS results are informational at first.

Do not overinterpret microbenchmarks. A one-line discard benchmark can mostly measure FFI overhead;
burst and file benchmarks are the better signal for the current native writer.

## Interpreting Native Benchmarks

> **Native benchmark results are platform-specific.** Linux x64 native benchmarks do not prove Linux
> ARM64 or Windows x64 performance — the OS, libc, allocator, and syscall costs all differ. Each
> target needs its own runtime benchmark on matching hardware before any performance claim is made
> for it. See `NATIVE.md` for which targets are cross-buildable versus runtime-tested.

Native FFI has per-call overhead. The Rust writer can lose on discard and memory microbenchmarks
because those workloads mostly measure the boundary crossing and TypeScript's per-line setup, not
real I/O.

Native should be judged on file sinks, buffered writes, burst logging, flush-after-burst behavior,
large batches, and separately labeled stdout/stderr real-I/O benchmarks. Native performance claims
must verify that the native backend actually loaded; `native: "auto"` fallback must not be counted
as native.

Discard-sink numbers are still useful as overhead diagnostics, but they are not marketing evidence
for the native backend.

### v0.7: buffered file writes by default

The native win on file I/O comes from the Rust `BufWriter` batching syscalls. As of v0.7, a file
destination defaults to a **64 KiB buffer** (`DEFAULT_FILE_BUFFER_SIZE` in
`src/backends/native.ts`), so this win is delivered without the caller setting `nativeBufferSize`.
Before v0.7 the default was `0` (unbuffered), which paid the FFI crossing **and** a syscall per line
— strictly worse than the pure TypeScript file sink. stdout/stderr stay unbuffered by default for
interactivity; discard ignores buffering.

Measured (median of 9 runs, burst-then-flush, default config): native is **0.54×** of pure at 1,000
lines (~1.9× faster), narrowing to **~0.9×** at 100,000 lines as the OS page cache absorbs pure's
extra syscalls. Native still loses on per-line discard/memory micro-workloads, where there is no
buffer to amortize the FFI crossing — that is expected, not a regression.

## Rolldown Bundle Investigation

`bench/bundle/` investigates whether bundling Pequi's TypeScript implementation into JavaScript
artifacts changes runtime logging performance. This is not `deno compile` and does not produce a
standalone executable.

Source TypeScript remains canonical. `mod.ts` stays the main entrypoint, and the non-minified
Rolldown bundle is an optional distribution artifact for users who want to test the bundled path.

The investigation found:

- The non-minified Rolldown bundle is marginally faster than source TypeScript on average, about
  +4.4% (refreshed after the v0.6 optimization).
- The minified bundle shows no reliable benefit, about +0.8% on average, and is not worth defaulting
  to because it hurts debuggability.
- The median CV/noise floor is around 14%, larger than nearly every per-case effect, so individual
  rows should not drive product decisions — only the average signal is useful.
- After the v0.6 hot-path optimization, the bundled package averages about +3.0% faster than Pino
  (it was −24% before v0.6).

Full per-case tables: `reports/rolldown-bundle-investigation.md`.

Output equivalence is required before performance numbers count. The runner compares bundled output
against source Pequi and normalizes volatile fields such as time, pid, hostname, and
runtime-specific metadata. Semantic checks cover simple messages, objects, format strings, errors,
child loggers, serializers, redaction, formatters, mixins, hooks, custom message/error/nested keys,
and `timestamp: false`.

Native bundled benchmarks must verify that the Rust backend actually loaded. Bundling can move
`import.meta.url`, so the benchmark runner supplies the native library path explicitly for bundled
native variants. A fallback to pure TypeScript is not counted as native performance.

Pino remains benchmark-only and test-only. The `pino-deno` variant is npm Pino running under Deno;
it is a reference point, not a runtime dependency and not Node-native Pino. Bundled output should
not be marketed as universally faster than Pino.

Run the investigation build with:

```sh
deno task bundle
```

Run the bundle comparison with:

```sh
deno task bench:bundle
deno task bench:bundle:compare
```

Run the native-capable bundle investigation with:

```sh
deno task bench:bundle:native
deno task bench:bundle:investigate
```

Interpret results per case. Disabled-level overhead, enabled string/object throughput, serializers,
redaction, hooks, child loggers, file bursts, flush cost, startup time, and native-vs-pure deltas
answer different questions.

Future benchmark changes must preserve source-vs-bundle and Pequi-vs-Pino comparisons.

## Pino Performance Gaps (v0.6 status)

The v0.6 hot-path optimization (copy-on-write serializer/redaction, slice-based formatter, baked
numeric level gate) closed the main gaps in the source implementation. Pequi is now faster than Pino
on the object-heavy and high-volume paths (serializer, redaction, formatter, child bindings, mixin,
bursts) and much closer on the lightweight string paths.

Remaining structural gaps, where Pino's direct string-building beats building a record object plus
`JSON.stringify`:

- Disabled-level reject (already faster than Pino warm; behind only in cold-start measurement).
- Enabled-string, format-string.
- Serializer and hooks (close, ~0.85–0.9× of Pino).

Closing these further would need a string-building fast path that bypasses the object-then-stringify
step for simple records — a larger architectural change, deferred.
