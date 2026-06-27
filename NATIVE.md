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
