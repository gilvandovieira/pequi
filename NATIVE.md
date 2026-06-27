# Native Backend

Pequi has one optional native backend: Rust loaded through Deno FFI.

The pure TypeScript backend remains mandatory for normal usage. Native support is optional, requires
`--allow-ffi`, and must not be required by code that wants portable Pequi behavior.

## Responsibility Boundary

TypeScript owns:

- Pino-compatible API behavior.
- Levels and child loggers.
- Bindings, serializers, redaction, and message formatting.
- JSON line encoding.
- UTF-8 encoding before calling Rust.

Rust owns:

- Accepting already encoded bytes.
- Writing bytes to the selected sink.
- Optional buffering.
- Flushing.
- Stable error codes and last-error strings.
- Safe handle cleanup.

Rust does not understand JavaScript objects, does not implement Pino compatibility, and does not
encode JSON. Rust JSON encoding is explicitly deferred.

## Native Modes

- `native: false` forces pure TypeScript and never calls `Deno.dlopen`.
- `native: "auto"` tries Rust and falls back to pure TypeScript if native is unavailable.
- `native: "required"` throws a startup error if the native library is missing, unsupported,
  incompatible, blocked by permissions, or cannot initialize.

Backend selection is centralized in `src/backend.ts`. `resolveBackend()` returns both the selected
backend and native diagnostics; `createBackend()` keeps the normal public behavior and returns only
the backend.

Diagnostics include the requested mode, selected backend, fallback reason, OS/architecture,
attempted library paths, expected/found ABI version, `Deno.dlopen` failure state, initialization
failure state, and native last-error text when available.

## Loading Process

The Deno loader:

1. Detects `Deno.build.os` and `Deno.build.arch`.
2. Maps Linux x64 and Linux ARM64 to Tier 1 prebuilt directories.
3. Resolves `prebuilt/<target>/libpequi_log.so` relative to `import.meta.url`.
4. Falls back to local development release artifacts under `native/rust/target/`.
5. Calls `Deno.dlopen` lazily only when native mode asks for native.
6. Validates `pequi_abi_version() === 1`.
7. Converts the configured destination into a native destination kind.
8. Initializes the Rust handle.

In `native: "auto"`, any load, ABI, destination, permission, or init failure is captured in
diagnostics and Pequi falls back to the pure TypeScript backend.

## Lifecycle Rules

- TypeScript calls `pequi_drop` exactly once per native backend.
- `close()` is idempotent.
- `write()` and `flush()` after `close()` throw `PequiNativeError`.
- Rust attempts to flush during drop and never panics across the FFI boundary.
- Children share their parent's backend; Pequi does not expose a logger-level close method.

## Targets

Tier 1 targets:

- `linux-x86_64-gnu`
- `linux-aarch64-gnu`

Expected prebuilt layout:

```text
prebuilt/
  linux-x86_64-gnu/
    libpequi_log.so
  linux-aarch64-gnu/
    .gitkeep
```

The current build script builds only the host Linux target and copies the artifact into the matching
prebuilt directory. Linux ARM64 release hardening and cross-compilation are planned.

## ABI

ABI version is `1`.

Exported C ABI symbols:

- `pequi_abi_version() -> u32`
- `pequi_init(destination_kind, path_ptr, path_len, buffer_size) -> *mut PequiHandle`
- `pequi_write(handle, bytes_ptr, bytes_len) -> i32`
- `pequi_flush(handle) -> i32`
- `pequi_last_error(handle, out_ptr, out_len) -> usize`
- `pequi_last_error_global(out_ptr, out_len) -> usize`
- `pequi_drop(handle)`

Destination kinds:

- `0` = discard
- `1` = stdout
- `2` = stderr
- `3` = file

Status codes:

- `0` = OK
- `1` = null handle
- `2` = null bytes pointer
- `3` = invalid UTF-8
- `4` = I/O error
- `5` = panic caught
- `6` = invalid destination
- `7` = invalid path
- `255` = unknown error

File destinations are opened in append/create mode and are not truncated by the native backend.

## Build And Test

```sh
deno task native:build
deno task native:check
deno task test:native
```

`native:check` and `test:native` require `--allow-ffi`. Normal tests still run without `--allow-ffi`
and native auto mode falls back cleanly when permission is missing.

## Benchmarks

```sh
deno task bench:native
deno task bench:native:compare
deno task bench:regression
```

Native benchmarks measure write-heavy workloads: direct already-encoded writes, file writes, burst
logging, flush cost, Pequi pure vs native, and Pequi native vs Pino under Deno. Disabled-level
logging remains TypeScript-only and should not call native.
