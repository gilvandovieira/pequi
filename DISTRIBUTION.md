# Distribution

This is the v0.5 distribution decision: how Pequi is shipped, which entry point to use, and the CI
policy that keeps the published bundle correct. It turns the Rolldown investigation
(`reports/rolldown-bundle-investigation.md`) into a stable, enforced policy.

## Entry points

`@pequi/log` exposes two equivalent runtimes plus backend subpaths:

| Import              | Resolves to              | Use it when                                                        |
| ------------------- | ------------------------ | ------------------------------------------------------------------ |
| `@pequi/log`        | `mod.ts` (TS source)     | Default. Deno/JSR consumers — tooling compiles and tree-shakes.    |
| `@pequi/log/bundle` | `dist/pequi.bundle.js`   | You want one pre-compiled JS file (npm, CDN, embedding, no build). |
| `@pequi/log/pure`   | `src/backends/pure.ts`   | Direct access to the pure TypeScript backend.                      |
| `@pequi/log/native` | `src/backends/native.ts` | Direct access to the Rust native backend loader.                   |

`mod.ts` is the **canonical source**. The bundle is a build artifact generated from it; it never
drives development.

## The bundle is optional

`@pequi/log/bundle` is a single, scope-hoisted JavaScript file (with a sourcemap and a
`dist/pequi.bundle.d.ts` type shim that re-exports `mod.ts`). Choose it for **packaging convenience,
not speed**:

- It is **not meaningfully faster**. Bundling averages ~+3–7% over running the source under Deno,
  which is inside the ~15% measurement-noise floor (see `reports/rolldown-bundle-investigation.md`).
  Treat it as packaging, not a performance upgrade.
- Its output is **verified semantically equivalent to source** in CI on every change
  (`tests/regression/bundle-equivalence.test.ts`), and its type exports are checked
  (`tests/types/bundle-export.test.ts`).

If you are on Deno or JSR, prefer `@pequi/log` — there is no reason to take the bundle.

## Minified output is not distributed

`deno task bundle --minify` can emit `dist/pequi.bundle.min.js`, but it is **experimental and never
published**. It is gitignored, excluded from `publish.include`, and not a default task target. The
investigation found no reliable speed benefit and worse debuggability, so the readable bundle is the
only distributed one.

## Native backend is orthogonal

The Rust native sink (`native: "auto" | "required"`) is independent of bundling and **opt-in**. It
targets sustained buffered I/O; for per-line discard/memory micro-workloads it is slower than pure
TypeScript because of FFI overhead. Both `@pequi/log` and `@pequi/log/bundle` default to the pure
backend.

## CI policy

CI (`.github/workflows/ci.yml`) gates every push and pull request on correctness:

1. `deno fmt --check`
2. `deno task lint`
3. `deno task check`
4. `deno task test` — source tests plus bundle semantic-equivalence, type-export, and import smoke
   tests. The pure suite runs without `--allow-ffi`, so native tests skip cleanly here.
5. `deno task test:native` — **native tests where available**. The ubuntu-x86_64 runner ships the
   committed prebuilt `.so`, so the Rust sink loads via FFI and its lifecycle/equivalence tests run
   for real.
6. `deno task native:verify:artifacts` — **artifact shape gate** (not a runtime test). Confirms each
   present prebuilt artifact has the expected name, folder, extension, and architecture metadata;
   missing cross artifacts are tolerated. See NATIVE.md "What verification means".
7. `deno task bundle:verify` — the **freshness gate**.
8. `deno task bench:smoke` — **benchmark smoke**. Runs every bundle/source/native/Pino variant at a
   tiny iteration count and asserts each ran and passed its correctness gate
   (`scripts/bench-smoke.ts`), so a crashed benchmark fails the build. It is a smoke test, not a
   measurement — timings are discarded.

### Freshness gate

Rolldown output is byte-deterministic, so the committed (and published) `dist/` bundle must equal a
clean rebuild of the current source. `deno task bundle:verify` rebuilds and compares SHA-256 of
`dist/pequi.bundle.js`, its sourcemap, and the type shim; it fails if they drift. This guarantees
`@pequi/log/bundle` is never stale relative to `mod.ts`.

> If you change anything under `src/` or `mod.ts`, run `deno task bundle` and commit the updated
> `dist/` artifacts. CI will fail otherwise. (The sourcemap tracks source, so even comment-only
> changes require a rebuild.)

### Performance is tracked, not gated

Benchmark regression is **not** a CI gate — the ~15% noise floor makes it unreliable for blocking
merges. The tooling and baseline still exist for manual and scheduled tracking:

- `deno task bench:bundle:investigate` — full bundled/source/native/Pino sweep.
- `deno task bench:bundle:regression` — compare against `bench/regression/bundle-baseline.json`.

## Releasing

1. Make source changes under `src/` / `mod.ts`.
2. `deno task bundle` and commit `dist/` (or CI's freshness gate will block the PR).
3. `deno publish` ships the canonical source plus the bundle artifacts listed in `publish.include`.
