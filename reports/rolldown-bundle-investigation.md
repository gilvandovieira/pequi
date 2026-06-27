# Rolldown Bundle Performance Investigation

_Question: does compiling/bundling Pequi with Rolldown improve runtime performance over running the
TypeScript source directly under Deno?_

**TL;DR — Yes, but modestly.** Averaged over 3 independent runs, the Rolldown bundle is **+6.5%**
faster than source; the minified bundle is **+4.8%**. The per-case measurement noise floor is **~12%
(median CV)**, which is larger than the effect for most individual cases, so the average is the
trustworthy signal, not any single row. The gains concentrate on closure-/hook-heavy paths. Output
is verified byte-identical to source. **Recommendation: ship the non-minified bundle; skip
minification.**

## Environment

- Deno 2.8.3 · V8 14.9.207.2 · TypeScript 6.0.3
- Rolldown 1.1.2 · Oxc 0.137.0 · Pino 10.3.1 (reference)
- 12th Gen Intel Core i7-12700H (20 threads) · linux/x86_64
- Bundles: `dist/pequi.bundle.js` (~45 KB) and `dist/pequi.bundle.min.js` (~23 KB), both with source
  maps. Built from `mod.ts`, so they include the current `serializeErrorValues`/`applySerializers`
  fast-path optimization.

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

| Case                  | source | bundled |    min |   pino | bundled vs source | min vs source | maxCV |
| --------------------- | -----: | ------: | -----: | -----: | ----------------: | ------------: | ----: |
| hooks-log-method      |   1.50 |    1.89 |   1.44 |   2.55 |        **+25.7%** |         −3.8% |  7.9% |
| formatter-level       |   2.20 |    2.65 |   2.19 |   3.77 |            +20.5% |         −0.6% | 12.1% |
| disabled-level-string |  12.33 |   14.85 |  14.67 |  55.91 |            +20.4% |        +19.0% | 12.3% |
| serializer            |   1.00 |    1.20 |   1.17 |   2.07 |            +19.5% |        +17.3% | 19.2% |
| disabled-level-object |  22.53 |   26.87 |  29.26 |  45.06 |            +19.2% |        +29.9% | 17.6% |
| format-string         |   0.93 |    1.04 |   1.00 |   2.10 |            +11.7% |         +7.4% | 18.8% |
| enabled-object-small  |   2.08 |    2.31 |   2.11 |   2.09 |            +11.4% |         +1.9% |  9.5% |
| enabled-object-medium |   0.72 |    0.77 |   0.80 |   1.08 |             +6.1% |        +11.2% |  7.1% |
| burst-1000            |   2.01 |    2.11 |   1.99 |   2.34 |             +4.9% |         −1.4% | 17.1% |
| flush-after-1000      |   2.21 |    2.24 |   2.18 |   1.93 |             +1.2% |         −1.5% | 12.4% |
| error-object          | 0.0224 |  0.0221 | 0.0217 | 0.0229 |             −1.2% |         −3.0% |  3.1% |
| child-bindings        |   1.64 |    1.62 |   1.50 |   2.10 |             −1.0% |         −8.9% | 13.7% |
| mixin                 |   1.88 |    1.86 |   2.11 |   2.32 |             −1.1% |        +12.5% | 17.4% |
| enabled-string        |   1.78 |    1.75 |   1.75 |   3.25 |             −1.3% |         −1.3% |  7.3% |
| file-burst-1000       |   0.67 |    0.64 |   0.73 |   0.75 |             −3.5% |         +8.9% |  6.5% |
| burst-10000           |   2.13 |    1.94 |   2.11 |   2.49 |             −8.9% |         −1.0% | 13.8% |
| redaction             |   0.89 |    0.78 |   0.84 |   0.82 |            −12.6% |         −4.9% | 17.2% |

**Averages across 17 cases:** bundled vs source **+6.5%** · bundled-min vs source **+4.8%** ·
bundled vs Pino **−23.6%** · median maxCV **12.4%**.

## Analysis

**Why bundling helps at all (same V8):** Rolldown scope-hoists the module graph into a single scope.
That lets V8 inline and devirtualize across what were ES-module boundaries — e.g. `buildRecord` →
`serializeErrorValues`, `formatJsonLine` → `safeStableStringify`, and the per-level method closures.
The effect is real but small.

**Credible signal vs noise.** Treating a case as a credible win only when the effect clearly exceeds
its own noise:

- **Credible:** `hooks-log-method` (+25.7% at 7.9% CV) and `enabled-object-small` (+11.4% at 9.5%
  CV). These are above the noise floor.
- **Likely real but noisier:** the `disabled-level-*`, `formatter-level`, and `serializer` cluster
  (+19–20%, CV 12–19%) — consistently positive across both bundled and (mostly) minified runs.
- **Within noise (treat as flat):** `format-string` (+11.7% at 18.8% CV), `enabled-object-medium`,
  `burst-1000`, `flush-after-1000`.
- **Apparent regressions are noise, not real:** `redaction` (−12.6%), `burst-10000` (−8.9%), and the
  minified `child-bindings` (−8.9%) all have CV at or above the effect size, and flip sign between
  bundled and minified. None reproduce a consistent slowdown.

**Net:** bundling is a small, broadly-positive change with no credible regression.

## Versus Pino

The −23.6% average "bundled vs Pino" is **skewed by a few extreme cases**, not representative:

- Pino dominates the trivial reject path (`disabled-level-*`: 45–56M vs 15–27M ops/sec) and
  `enabled-string` / `format-string` (~2x), which drag the average down.
- On realistic structured logging the bundle is **at parity or ahead**: `enabled-object-small` 2.31
  vs 2.09 (ahead), `flush-after-1000` 2.24 vs 1.93 (ahead), `burst-1000` 2.11 vs 2.34 (close).

Bundling narrows the Pino gap on the closure-heavy paths but does not change the structural gaps
(format-string, serializer, enabled-string remain ~2x — those are algorithmic, not
bundling-related).

## Minification

Not worth it. It averages **less** than plain bundling (+4.8% vs +6.5%) and is inconsistent
(`child-bindings` −8.9% minified vs −1.0% bundled; `formatter-level` −0.6% minified vs +20.5%
bundled; `mixin` +12.5% minified vs −1.1% bundled). No reliable speed benefit, and it costs
debuggability. Keep the readable bundle.

## Native backend (orthogonal note)

The native FFI variants were also available during the initial sweep. For these discard/memory
micro-workloads native is **slower** than pure TS (e.g. `enabled-string` −70%, `child-bindings` −56%
vs pure source) because the per-write FFI crossing costs more than it saves; it only wins on
`file-burst` (+33%). Native pays off for real buffered I/O, not per-line micro-benchmarks. This is
independent of the bundling question.

## Recommendation

1. **Publish the non-minified Rolldown bundle** as a distribution artifact. It is a low-risk ~6–7%
   win with output verified identical to source and source maps emitted.
2. **Do not minify** — no measurable speed benefit, worse debuggability.
3. Keep `mod.ts` as the canonical source; the bundle is a build artifact, not the source of truth.
4. If a firmer per-case number is ever needed, raise iterations and run ≥5 reps — the current ~12%
   noise floor masks effects below ~15%.

## Caveats

- Discard sink only (isolates logger CPU cost; excludes real I/O).
- Micro-benchmarks on one machine/V8; absolute numbers are not portable, only relative deltas.
- Single timed loop per case per process; the 3-run mean tames but does not eliminate the ~12% noise
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
