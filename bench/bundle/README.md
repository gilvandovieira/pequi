# Bundle Benchmarks

This suite measures whether bundling Pequi's TypeScript implementation with Rolldown/Oxc changes
runtime logging performance. It does not use `deno compile`.

## Build

```sh
deno task bundle
```

This creates:

- `dist/pequi.bundle.js`
- `dist/pequi.bundle.js.map`
- `dist/pequi.bundle.d.ts`

The minified bundle is experimental and is not built by default. To rebuild it for investigation
only:

```sh
deno run --allow-read --allow-write --allow-run scripts/build-bundle.ts --minify
```

## Run

Source and bundled comparison:

```sh
deno task bench:bundle
deno task bench:bundle:compare
```

The default matrix includes source Pequi, the non-minified bundle, Pino under Deno, and native
variants when available. The minified bundle is excluded from default averages; run it explicitly
with `--variant bundled-min-pure` when investigating minification.

Native-capable run:

```sh
deno task bench:bundle:native
```

Full investigation orchestration:

```sh
deno task bench:bundle:investigate
```

Useful direct runner examples:

```sh
deno run --allow-read --allow-write bench/bundle/runner.ts \
  --variant source-pure --output reports/bundle-source-current.json

deno run --allow-read --allow-write bench/bundle/runner.ts \
  --variant bundled-pure --output reports/bundle-rolldown-current.json

deno run --allow-read --allow-write --allow-ffi bench/bundle/runner.ts \
  --variant bundled-native \
  --native-library-path prebuilt/linux-x86_64-gnu/libpequi_log.so \
  --output reports/bundle-native-current.json
```

## Reports

Reports are JSON and include environment details, startup timing, semantic correctness results,
native availability, and per-case throughput.

The default comparison report is:

```text
bench/reports/bundle-current.json
```

The investigation script also writes root-level report snapshots under `reports/`.

## Caveats

Use discard destinations for primary microbenchmarks. Memory destinations are for correctness
capture. File destinations are for file-specific cases and native file checks.

Bundled native runs must verify native loading. If `native: "auto"` falls back to pure TypeScript,
that is correct runtime behavior but not native performance.

Small iteration counts are useful for smoke checks only. Use larger counts for decisions, prefer
aggregate signals over individual noisy rows, and interpret results case by case instead of as a
single winner.
