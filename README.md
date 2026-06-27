# Pequi

Pequi is a Deno-first structured logger published as `@pequi/log`. It provides a Pino-compatible
TypeScript API shape with a pure TypeScript backend by default.

The TypeScript layer owns public API behavior, argument normalization, serializers, redaction,
formatting, and JSON encoding. The optional Rust native backend remains a write/flush sink and is
not required for normal use.

## Imports

```ts
import pino from "@pequi/log";
import { pequi } from "@pequi/log";

const a = pino();
const b = pequi();
```

The default export and named `pequi` export are the same factory.

## Basic Logging

```ts
const log = pequi({ level: "info", name: "api" });

log.info("server started");
log.info({ userId: "123" }, "user logged in");
log.warn({ route: "/health" }, "slow request");
log.error(new Error("boom"), "request failed");
```

## Child Loggers

```ts
const child = log.child({ module: "auth" });
child.info({ userId: "123" }, "login accepted");
```

## Serializers

```ts
const log = pequi({
  serializers: {
    user(value) {
      return { id: value.id };
    },
  },
});
```

## Redaction

```ts
const log = pequi({
  redact: ["password", "user.token"],
});
```

Pequi currently supports a useful subset of Pino redaction paths.

## Message and Error Keys

```ts
const log = pequi({
  messageKey: "message",
  errorKey: "error",
  timestamp: false,
});
```

## Memory Destination for Tests

```ts
import { pequi } from "@pequi/log";

const lines: string[] = [];
const log = pequi({ timestamp: false }, {
  write(chunk) {
    lines.push(chunk);
    return true;
  },
});

log.info("captured");
```

## Native Mode

```ts
const log = pequi({ native: "auto" });
```

Native modes:

- `native: false` forces pure TypeScript.
- `native: "auto"` tries Rust and falls back to pure TypeScript.
- `native: "required"` fails if Rust cannot load.

Deno FFI requires `--allow-ffi`; normal TypeScript usage and tests do not. Pure TypeScript remains
the default fallback and native is not mandatory for Pequi usage.

```ts
const pure = pequi({ native: false });
const optionalNative = pequi({ native: "auto" });
const requiredNative = pequi({ native: "required" });
```

Build and check the Rust backend locally:

```sh
deno task native:build
deno task native:check
```

Run native-specific tests and benchmarks:

```sh
deno task test:native
deno task bench:native
deno task bench:native:compare
```

The native backend accelerates only write/flush sink work today. TypeScript still owns Pino
compatibility and JSON encoding.

## Bundle Artifact

Pequi is authored in TypeScript and `mod.ts` remains the canonical entrypoint. A non-minified
Rolldown bundle may be available at `@pequi/log/bundle` for users who want to test the bundled
distribution path.

The bundle is semantically checked against source. See [BENCHMARKS.md](./BENCHMARKS.md) for
methodology and results.

## Development

```sh
deno task fmt
deno task lint
deno task check
deno task test
deno task bench
```

The compatibility oracle is pinned to `npm:pino@10.3.1` and is used only in tests.
