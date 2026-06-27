# Native Backend

Pequi has one optional native backend written in Rust.

The Rust backend is optional and loaded through Deno FFI. It is not required for normal usage,
normal tests, or the pure TypeScript backend.

## Responsibility Boundary

TypeScript:

- Normalizes the Pino-shaped API.
- Applies bindings, serializers, and redaction.
- Encodes JSON.

Rust:

- Accepts already encoded bytes.
- Writes bytes to the sink.
- Flushes.
- Stores the last error.
- Frees the native handle.

Rust does not understand JavaScript objects and does not implement JSON encoding in this scaffold.

## Permission

Deno FFI requires `--allow-ffi`.

## Native Modes

- `native: false` forces pure TypeScript.
- `native: "auto"` tries Rust and falls back to pure TypeScript.
- `native: "required"` throws a clear startup error if Rust cannot load.

## Tier 1 Targets

- `linux-x86_64-gnu`
- `linux-aarch64-gnu`

Expected prebuilt layout:

```text
prebuilt/
  linux-x86_64-gnu/
    libpequi_native.so
  linux-aarch64-gnu/
    libpequi_native.so
```

## ABI

The Rust crate exports stable C ABI function names:

- `pequi_init`
- `pequi_write`
- `pequi_flush`
- `pequi_last_error`
- `pequi_drop`
