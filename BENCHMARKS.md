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

The current native backend supports stdout only, so it is skipped by the fair discard and memory
destination comparison unless native destination support changes later.
