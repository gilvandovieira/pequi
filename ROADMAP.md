# Roadmap

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
