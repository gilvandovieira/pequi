<p align="center">
  <img src="./assets/pequi-banner.png" alt="Pequi" width="480" />
</p>

<p align="center">
  <a href="https://gilvandovieira.github.io/pequi/">Landing page &amp; benchmarks</a>
</p>

# Pequi

Pequi is a Deno-first structured logger distributed as `@pequi/log`. It provides a Pino-compatible
TypeScript API shape with a pure TypeScript backend by default.

The TypeScript layer owns public API behavior, argument normalization, serializers, redaction,
formatting, and JSON encoding. The optional Rust native backend remains a write/flush sink and is
not required for normal use.

> **Status: experimental — v0.8.0, pre-1.0.** Pequi is under active development. It implements a
> Pino-compatible subset verified against an oracle pinned to `npm:pino@10.3.1` (see
> [COMPATIBILITY.md](./COMPATIBILITY.md)), but the API may still change before 1.0, and not every
> Pino feature is covered. Early releases are published to [JSR](https://jsr.io/@pequi/log) from the
> release workflow below — pin an exact version and expect breaking changes between minor versions
> until 1.0. The Rust native backend is optional and only Linux x64 ships a runtime-tested artifact
> today; ARM64 and Windows are cross-buildable but not yet runtime-tested (see
> [NATIVE.md](./NATIVE.md)).

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

### When to use it

Rarely — native only accelerates the write/flush path, not formatting or serialization. Reach for it
only when **all** of these hold: you log **high volume to a file**, you can ship the prebuilt Rust
`.so` and grant `--allow-ffi`, and **buffered writes are acceptable** (file destinations buffer by
default since v0.7, flushing on `flush()`/drop). Measured file bursts run ~1.9× faster than pure at
1,000 lines, narrowing to ~1.1× at 100,000.

Stay on the default pure TypeScript backend for stdout/stderr, discard/memory/network sinks,
per-line or low-volume logging, serverless/edge, or anywhere you can't ship a native binary — native
was ~52% slower in those discard micro-workloads, where there's no buffer to amortize the FFI
crossing. If you do depend on the native win, use `native: "required"` so a missing library fails
loudly instead of silently falling back to pure. See `NATIVE.md` for the full guide.

```ts
const pure = pequi({ native: false });
const optionalNative = pequi({ native: "auto" });
const requiredNative = pequi({ native: "required" });
```

### Native targets

Pequi's native Rust backend currently builds artifacts for:

- Linux x64
- Linux ARM64
- Windows x64 GNU

Native remains optional and pure TypeScript remains the default fallback. Cross-built artifacts are
not claimed as fully runtime-tested until they run on a matching OS/architecture. See
[NATIVE.md](./NATIVE.md) for the cross-compilation, build, and verification details.

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

## Releases

Pequi publishes to [JSR](https://jsr.io/@pequi/log) from `.github/workflows/publish.yml`. Because
the project is pre-1.0, releases are deliberate rather than automatic:

1. Bump the version in `deno.json` and `jsr.json` (and `src/logger.ts`), run `deno task bundle`, and
   commit the updated `dist/` artifacts.
2. Create a GitHub Release tagged `vX.Y.Z` (matching the package version).
3. The publish workflow re-runs the release gates and then runs `deno publish` to JSR.

The workflow authenticates to JSR with GitHub OIDC (no token secret), so the JSR package must be
linked to this repository once before the first publish. It can also be triggered manually with
`workflow_dispatch`; a release-triggered run fails if the tag does not match the `jsr.json` version.
