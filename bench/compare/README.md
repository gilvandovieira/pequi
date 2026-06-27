# Pequi vs Pino Benchmarks

These benchmarks compare Pequi's current TypeScript implementation with `npm:pino@10.3.1` running
through Deno's npm compatibility layer.

## Variants

- `pequi-pure`: Pequi with `native: false`.
- `pino-deno`: Pino imported from npm and executed under Deno.
- `pequi-native`: optional. It is registered only when the native backend can be created with the
  same benchmark destination. The current native backend supports stdout only, so it is skipped for
  these discard and memory destination comparisons.

Pino under Deno is not the same thing as Node-native Pino. Deno's npm compatibility layer is part of
what `pino-deno` measures. A future `pino-node` benchmark should live separately because it answers
a different question.

## Methodology

Most comparison benchmarks use a discard sink that implements `write(chunk)`, counts writes and
bytes, and does not store log lines. This avoids terminal I/O and keeps the benchmark focused on
logger work for equivalent payloads and equivalent levels.

The memory sink is used only where retaining output is useful, such as parseability guards and the
small memory-destination benchmark. Memory destination results should not be used as the primary
performance claim.

Stdout and stderr are excluded from comparison microbenchmarks because terminal behavior can
dominate the result. Timestamp and base fields are disabled in most benchmarks with
`timestamp: false` and `base: null` so pid, hostname, and clock reads do not dominate the
comparison.

Each benchmark group states the workload being measured. Results should be interpreted per workload:
disabled-level overhead, enabled string logging, enabled object logging, formatting, serializers,
redaction, error logging, child bindings, memory destinations, and burst throughput are separate
cost centers.

Format-string benchmarks currently use `%s` and `%d`, which are supported by both libraries in this
suite.

## Running

```sh
deno task bench:compare
```

Native comparison attempts can be run with:

```sh
deno task bench:compare:native
```

The native variant skips cleanly when it cannot be loaded or cannot use the same destination shape.
