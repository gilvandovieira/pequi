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
