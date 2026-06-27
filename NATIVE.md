# Native Backend

Pequi has one optional native backend: Rust loaded through Deno FFI.

The pure TypeScript backend remains mandatory for normal usage. Native support is optional, requires
`--allow-ffi`, and must not be required by code that wants portable Pequi behavior.

## When to Use Native

Rarely. Native only accelerates the **write/flush** path — TypeScript still builds every log line
(formatting, serializers, redaction, JSON encoding), so native does nothing for CPU-bound logging.
For most applications the pure TypeScript backend (the default) is the right choice: after v0.6 it
is already faster than Pino on most paths, runs anywhere Deno runs, and needs no native library.

Use `native: "auto"` / `"required"` only when **all** of these hold:

- **High-volume logging to a file.** This is the one workload where native wins, because the Rust
  `BufWriter` batches syscalls. Measured file bursts: ~1.9× faster than pure at 1,000 lines,
  narrowing to ~1.1× at 100,000 (the OS page cache absorbs pure's extra syscalls at scale).
- **You can ship the prebuilt `.so`** for your platform and grant `--allow-ffi`.
- **Buffered writes are acceptable.** File destinations buffer (64 KiB by default, since v0.7), so
  lines are flushed on `flush()`/drop, not per line; a hard crash can lose the buffered tail. Set
  `nativeBufferSize: 0` for unbuffered/synchronous writes.

Stay on pure TypeScript (`native: false`, the default) when any of these apply:

- You log to **stdout/stderr** (native keeps these unbuffered for interactivity — little benefit,
  and the FFI crossing can make it slower).
- You use **discard / memory / network sinks, or write per line** — native was ~52% slower in these
  micro-workloads, where there is no buffer to amortize the FFI crossing.
- **Low or moderate volume** — the win only appears under sustained bursts.
- **Serverless / edge, or you cannot ship a native binary** — pure TypeScript needs no
  `--allow-ffi`.
- Your bottleneck is the **log payload** (serialization/formatting), which native does not touch.

Operational note: `native: "auto"` silently falls back to pure TypeScript if the library cannot
load. If you are relying on the native win, use `native: "required"` (which fails loudly) or check
the backend diagnostics — otherwise a fallback can be mistaken for native performance.

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

Configured targets and their prebuilt artifacts:

| Pequi target         | Rust target triple          | Artifact          |
| -------------------- | --------------------------- | ----------------- |
| `linux-x86_64-gnu`   | `x86_64-unknown-linux-gnu`  | `libpequi_log.so` |
| `linux-aarch64-gnu`  | `aarch64-unknown-linux-gnu` | `libpequi_log.so` |
| `windows-x86_64-gnu` | `x86_64-pc-windows-gnu`     | `pequi_log.dll`   |

Expected prebuilt layout:

```text
prebuilt/
  linux-x86_64-gnu/
    libpequi_log.so
  linux-aarch64-gnu/
    .gitkeep
  windows-x86_64-gnu/
    .gitkeep
```

Only `linux-x86_64-gnu` ships a committed, runtime-tested artifact today. `linux-aarch64-gnu` and
`windows-x86_64-gnu` are cross-buildable from Linux x64 but are **not** claimed as runtime-tested
until they run on a matching OS/CPU (see "Cross-compilation").

## Cross-compilation

Rust can build native dynamic libraries for several targets from one host, and Pequi uses this to
produce prebuilt native artifacts.

**Cross-building is not the same as runtime testing.** Building an artifact for a target only means
the bytes exist; it says nothing about whether they run. Deno FFI can only load a dynamic library
built for the **current** OS and CPU architecture:

- Linux x64 **cannot** load Linux ARM64 artifacts.
- Linux **cannot** load Windows `.dll` files.
- Windows **cannot** load Linux `.so` files.

So a Linux x64 machine can _build_ a Linux x64 `.so`, a Linux ARM64 `.so`, and a Windows x64 `.dll`,
but that same Linux x64 Deno process can only _load and test_ the Linux x64 `.so`.

| Pequi target         | Rust target triple          | Artifact          | Build from Linux x64?     | Runtime test on Linux x64? |
| -------------------- | --------------------------- | ----------------- | ------------------------- | -------------------------- |
| `linux-x86_64-gnu`   | `x86_64-unknown-linux-gnu`  | `libpequi_log.so` | yes                       | yes                        |
| `linux-aarch64-gnu`  | `aarch64-unknown-linux-gnu` | `libpequi_log.so` | yes, with cross linker    | no                         |
| `windows-x86_64-gnu` | `x86_64-pc-windows-gnu`     | `pequi_log.dll`   | yes, with MinGW toolchain | no                         |

Runtime testing each target needs a matching runner: Linux x64 for `linux-x86_64-gnu`, Linux ARM64
for `linux-aarch64-gnu`, Windows x64 for `windows-x86_64-gnu`.

## Required toolchains

Add the Rust targets you want to build:

```sh
rustup target add x86_64-unknown-linux-gnu
rustup target add aarch64-unknown-linux-gnu
rustup target add x86_64-pc-windows-gnu
```

The Linux ARM64 and Windows cross-builds also need system cross linkers. Examples (install only what
you need):

```sh
# Arch / CachyOS
sudo pacman -S aarch64-linux-gnu-gcc mingw-w64-gcc

# Debian / Ubuntu
sudo apt install gcc-aarch64-linux-gnu gcc-mingw-w64-x86-64
```

## Build commands

```sh
deno task native:build            # build the host target
deno task native:build:x64        # build Linux x64
deno task native:build:aarch64    # build Linux ARM64
deno task native:build:windows    # build Windows x64 GNU
deno task native:build:all        # build all configured native targets
deno task native:verify:artifacts # verify expected artifacts exist and look correct
```

A cross-build fails with a clear cargo error if its Rust target or system linker is missing.

## What verification means

`deno task native:verify:artifacts` checks, for each configured target, that the artifact:

- exists,
- has the expected file name,
- lives in the expected `prebuilt/<target>/` folder,
- carries the expected architecture metadata, when available (ELF/PE header machine id),
- has the expected extension (`.so` or `.dll`).

It does **not** prove:

- that Deno FFI can load the artifact on the current machine,
- that the target platform's runtime behavior is correct,
- that file I/O works on that platform,
- that flush/close behavior works on that platform.

Runtime testing requires a matching runner:

- Linux x64 runner for `linux-x86_64-gnu`,
- Linux ARM64 runner for `linux-aarch64-gnu`,
- Windows x64 runner for `windows-x86_64-gnu`.

Missing cross artifacts are reported but tolerated; verification fails only when an artifact that is
present has the wrong name, extension, or architecture.

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

## Checking And Testing

```sh
deno task native:check   # load the host artifact through FFI and sanity-check it
deno task test:native    # run the native FFI test suite on the host
```

`native:check` and `test:native` require `--allow-ffi`. Normal tests still run without `--allow-ffi`
and native auto mode falls back cleanly when permission is missing. See "Build commands" above for
building and verifying artifacts.

## Benchmarks

```sh
deno task bench:native
deno task bench:native:compare
deno task bench:regression
```

Native benchmarks measure write-heavy workloads: direct already-encoded writes, file writes, burst
logging, flush cost, Pequi pure vs native, and Pequi native vs Pino under Deno. Disabled-level
logging remains TypeScript-only and should not call native.

## Native Performance Interpretation

Native Rust currently accelerates write/flush behavior, not Pino API semantics. TypeScript still
owns formatting, compatibility, serializers, redaction, hooks, child loggers, level checks, and JSON
encoding.

Every native write crosses Deno FFI. That per-line crossing has overhead, so native can lose in
discard or memory microbenchmarks where there is little or no real I/O to amortize the call.

Native is expected to matter for file sinks, buffered writes, burst logging, large batches, and
flush behavior. Stdout and stderr benchmarks should be labeled separately as real-I/O workloads.

Native benchmark reports must include the destination and workload, and the runner must verify that
the native backend actually loaded. A clean `native: "auto"` fallback is correct behavior, but it
must not be reported as native performance.

## Bundled artifact native loading

Bundling can change the meaning of `import.meta.url`. The source native loader resolves prebuilt
libraries relative to `src/backends/native.ts`; a bundled artifact resolves from the generated
bundle location instead.

Normal source usage keeps the default `import.meta.url` resolution. Bundle investigation code may
provide an explicit native library path so the benchmark can test the TypeScript layer after
bundling without hardcoding dist-relative assumptions into the logger.

Native bundle benchmarks must verify that the native backend actually loaded with
`native: "required"` or backend diagnostics. A clean fallback in `native: "auto"` is correct runtime
behavior, but it must not be reported as native performance.

If a bundled native run cannot load the Rust library, mark the native bundled variant skipped or
invalid and keep the pure bundled result separate.
