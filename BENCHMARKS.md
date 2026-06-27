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

Native FFI has per-call overhead. The Rust writer can lose on discard and memory microbenchmarks
because those workloads mostly measure the boundary crossing and TypeScript's per-line setup, not
real I/O.

Native should be judged on file sinks, buffered writes, burst logging, flush-after-burst behavior,
large batches, and separately labeled stdout/stderr real-I/O benchmarks. Native performance claims
must verify that the native backend actually loaded; `native: "auto"` fallback must not be counted
as native.

Discard-sink numbers are still useful as overhead diagnostics, but they are not marketing evidence
for the native backend.

## Rolldown Bundle Investigation

`bench/bundle/` investigates whether bundling Pequi's TypeScript implementation into JavaScript
artifacts changes runtime logging performance. This is not `deno compile` and does not produce a
standalone executable.

Source TypeScript remains canonical. `mod.ts` stays the main entrypoint, and the non-minified
Rolldown bundle is an optional distribution artifact for users who want to test the bundled path.

The investigation found:

- The non-minified Rolldown bundle was modestly faster than source TypeScript on average, about
  +6.5%.
- The minified bundle was less consistent, about +4.8% on average, and is not worth defaulting to
  because it hurts debuggability.
- The median CV/noise floor was around 12%, so individual rows should not drive product decisions.
- The average signal is more useful than any single case.
- Gains were concentrated around closure-heavy, hook-heavy, formatter-heavy, and disabled-level
  paths.

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

## Next Pino Performance Gaps

The bundle helps some TypeScript runtime shape costs, but the remaining Pino gaps should be attacked
directly in the source implementation:

- Disabled-level fast path.
- Enabled-string path.
- Format-string path.
- Serializer overhead.
- Redaction overhead.
- Formatter and hook overhead.
