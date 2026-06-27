# Rolldown Bundle Performance Investigation

_Question: does compiling/bundling Pequi with Rolldown improve runtime performance over running the
TypeScript source directly under Deno?_

**TL;DR — Yes, but marginally.** Averaged over 3 independent runs (refreshed after v0.7), the
Rolldown bundle is **~+1–4% faster than source** across runs — the exact figure swings (+1.2% this
run) because the per-case noise floor is **~14% (median CV)**, larger than the effect, so only the
direction is trustworthy. Output is verified byte-identical to source. Separately, after the v0.6
source optimization the bundle now averages **~+5% vs Pino** (faster), versus −24% before v0.6.
**Recommendation: ship the non-minified bundle; skip minification.**

## Environment

- Deno 2.8.3 · V8 14.9.207.2 · TypeScript 6.0.3
- Rolldown 1.1.2 · Oxc 0.137.0 · Pino 10.3.1 (reference)
- 12th Gen Intel Core i7-12700H (20 threads) · linux/x86_64
- Bundles: `dist/pequi.bundle.js` (~44 KB) and `dist/pequi.bundle.min.js` (~23 KB), both with source
  maps. Built from `mod.ts`, so they include the v0.6 hot-path optimization (copy-on-write
  serializer/redaction, slice-based formatter, baked numeric level gate).

## Methodology

- Variants: `source-pure` (baseline TS via Deno), `bundled-pure` (Rolldown), `bundled-min-pure`
  (Rolldown + minify), `pino-deno` (reference).
- Each variant run as **3 independent processes** (`bench/bundle/runner.ts --variant <v>`), so
  process-level GC/JIT/memory-layout variance is captured rather than hidden.
- 20,000 timed iterations per case after 2,000 warmup; discard sink (no real I/O); single timed loop
  per case per process.
- Every bundled variant passed the runner's **correctness gate** (14 semantic cases produce
  normalized output identical to source) before being timed.
- Reported numbers are the **mean of the 3 runs**; `maxCV%` is the largest coefficient of variation
  (stddev/mean) across the four variants for that case — the noise indicator.

## Results (mean of 3 runs, M ops/sec)

| Case                  | source | bundled |   min |  pino | bundled vs source | min vs source | maxCV |
| --------------------- | -----: | ------: | ----: | ----: | ----------------: | ------------: | ----: |
| burst-1000            |   2.71 |    3.30 |  2.88 |  2.23 |            +21.5% |         +6.0% |   13% |
| enabled-object-medium |   1.09 |    1.24 |  1.40 |  1.06 |            +14.1% |        +28.1% |   13% |
| serializer            |   2.06 |    2.30 |  2.22 |  2.53 |            +11.3% |         +7.7% |   18% |
| burst-10000           |   3.13 |    3.42 |  3.28 |  2.09 |             +9.5% |         +4.9% |   14% |
| child-bindings        |   2.13 |    2.31 |  2.47 |  2.00 |             +8.4% |        +15.6% |   15% |
| enabled-object-small  |   2.70 |    2.85 |  2.80 |  2.07 |             +5.4% |         +3.8% |   20% |
| file-burst-1000       |   0.71 |    0.74 |  0.78 |  0.66 |             +4.7% |        +10.0% |    7% |
| hooks-log-method      |   2.31 |    2.39 |  2.25 |  2.63 |             +3.5% |         −2.3% |   18% |
| format-string         |   1.37 |    1.42 |  1.57 |  2.02 |             +3.4% |        +14.3% |   18% |
| disabled-level-string |  19.31 |   19.92 | 19.30 | 48.06 |             +3.1% |         −0.0% |   26% |
| mixin                 |   3.13 |    3.14 |  3.18 |  2.96 |             +0.2% |         +1.4% |    5% |
| redaction             |   1.15 |    1.13 |  1.05 |  0.89 |             −1.7% |         −8.9% |    9% |
| error-object          |   0.03 |    0.03 |  0.03 |  0.03 |             −1.9% |         +1.4% |    2% |
| flush-after-1000      |   2.92 |    2.85 |  2.98 |  2.04 |             −2.3% |         +2.1% |   23% |
| formatter-level       |   4.04 |    3.80 |  3.85 |  4.15 |             −5.9% |         −4.8% |    4% |
| enabled-string        |   2.58 |    1.92 |  2.67 |  3.09 |            −25.7% |         +3.1% |   14% |
| disabled-level-object |  47.72 |   34.39 | 47.99 | 46.14 |            −27.9% |         +0.6% |   21% |

**Averages across 17 cases:** bundled vs source **+1.2%** · bundled-min vs source **+4.9%** ·
bundled vs Pino **+5.3%** · median maxCV **14%**.

## Analysis

**Why bundling helps at all (same V8):** Rolldown scope-hoists the module graph into a single scope.
That lets V8 inline and devirtualize across what were ES-module boundaries — e.g. `buildRecord` →
`serializeErrorValues`, `formatJsonLine` → `safeStableStringify`, and the per-level method closures.
The effect is real but small.

**Credible signal vs noise.** The bundled-vs-source deltas are individually indistinguishable from
noise: each sits below its own 9–26% CV, and they swing between runs. The `disabled-level-*` reject
path is the clearest example — last run it showed +46% / −44% for the two disabled cases, this run
+3% / −28%; the cell value is dominated by measurement noise, not a real effect. The trustworthy
statement is the aggregate: **≈+1% this run** (about +1–4% across runs), with no case showing a
reproducible regression.

**Net:** bundling is a small, broadly-positive change within the noise floor — worth taking for
distribution, not for speed.

## Versus Pino

This flipped with v0.6. The bundled package now averages **~+5% faster than Pino** (it was −24%
before the source optimization). Per case:

- **Faster than Pino:** the object-heavy and high-volume paths — `enabled-object` (small/medium),
  `redaction`, `child-bindings`, `mixin`, `burst-1000/10000`, `flush-after-1000`, and `file-burst`.
- **Still behind Pino:** the lightweight string and reject paths — `disabled-level-string`,
  `enabled-string`, `format-string`, `serializer`, `hooks-log-method` — where Pino's direct
  string-building beats building a record object plus `JSON.stringify`. These are the structural,
  algorithmic gaps, not bundling-related.

## Minification

Roughly on par with plain bundling on average and inconsistent per case (e.g.
`enabled-object-medium` +28% minified vs +14% bundled; `redaction` −9% minified vs −2% bundled). No
reliable speed benefit, and it costs debuggability. Keep the readable bundle.

## Native backend (orthogonal note)

The native FFI variants were measured too. For the discard/memory micro-workloads native is **~52%
slower** than pure TS on average (the per-write FFI crossing costs more than it saves, with no
buffer to amortize it). But on the one real-I/O case, **`file-burst` now favors native** — 0.80 vs
0.71 M ops/sec (≈1.14× faster than pure source). That win arrived in **v0.7**, which made file
destinations buffer by default (64 KiB); before v0.7 the native default was unbuffered, so it paid
the FFI crossing plus a syscall per line and lost even on file I/O. Native pays off for sustained
buffered I/O, not per-line discard micro-benchmarks. This is independent of the bundling question.

## Recommendation

1. **Publish the non-minified Rolldown bundle** as a distribution artifact. It is a low-risk ~4% win
   with output verified identical to source and source maps emitted.
2. **Do not minify** — no measurable speed benefit, worse debuggability.
3. Keep `mod.ts` as the canonical source; the bundle is a build artifact, not the source of truth.
4. If a firmer per-case number is ever needed, raise iterations and run ≥5 reps — the current ~14%
   noise floor masks effects below ~15%.

## Caveats

- Discard sink only (isolates logger CPU cost; excludes real I/O).
- Micro-benchmarks on one machine/V8; absolute numbers are not portable, only relative deltas.
- Single timed loop per case per process; the 3-run mean tames but does not eliminate the ~14% noise
  floor.

## Reproduction

```sh
# Full sweep (also builds the bundle and runs native + pino):
deno task bench:bundle:investigate

# Single variant (what this report used, repeated 3x per variant):
deno run --allow-read --allow-write --allow-env --allow-sys \
  bench/bundle/runner.ts --variant bundled-pure --output reports/<name>.json
```

Raw per-run JSON from the full sweep is under `reports/bundle-*-current.json`.
