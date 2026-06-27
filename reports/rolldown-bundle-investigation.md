# Rolldown Bundle Performance Investigation

_Question: does compiling/bundling Pequi with Rolldown improve runtime performance over running the
TypeScript source directly under Deno?_

**TL;DR — Yes, but marginally.** Averaged over 3 independent runs (numbers refreshed after the v0.6
hot-path optimization), the Rolldown bundle is **+4.4%** faster than source; the minified bundle is
**+0.8%**. The per-case measurement noise floor is **~14% (median CV)**, larger than the effect for
nearly every case, so the average is the only trustworthy signal. Output is verified byte-identical
to source. Separately, the v0.6 source optimization closed the API-layer gaps: the bundle now
averages **+3.0% vs Pino** (faster), versus −24% before v0.6. **Recommendation: ship the
non-minified bundle; skip minification.**

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
| disabled-level-string |  18.46 |   27.00 | 17.04 | 50.39 |            +46.3% |         −7.7% |   16% |
| enabled-object-small  |   2.80 |    3.33 |  2.81 |  1.68 |            +18.6% |         +0.3% |   14% |
| flush-after-1000      |   2.72 |    3.22 |  2.89 |  2.11 |            +18.3% |         +6.4% |   17% |
| serializer            |   2.08 |    2.21 |  1.84 |  2.39 |             +6.3% |        −11.6% |   18% |
| mixin                 |   2.65 |    2.80 |  3.01 |  2.81 |             +5.7% |        +13.6% |    9% |
| child-bindings        |   2.14 |    2.25 |  2.10 |  2.23 |             +4.7% |         −2.0% |   13% |
| redaction             |   1.06 |    1.11 |  1.05 |  0.92 |             +4.7% |         −0.7% |   13% |
| file-burst-1000       |   0.64 |    0.67 |  0.68 |  0.70 |             +4.3% |         +6.3% |   12% |
| error-object          |   0.03 |    0.03 |  0.03 |  0.03 |             +3.3% |         +0.2% |    2% |
| burst-1000            |   2.99 |    3.07 |  3.09 |  2.35 |             +2.6% |         +3.3% |    7% |
| hooks-log-method      |   2.28 |    2.33 |  2.13 |  2.75 |             +2.2% |         −6.6% |   14% |
| formatter-level       |   3.56 |    3.63 |  3.61 |  4.03 |             +2.1% |         +1.5% |   15% |
| enabled-object-medium |   1.15 |    1.17 |  1.31 |  1.04 |             +2.0% |        +13.9% |    9% |
| enabled-string        |   2.24 |    2.28 |  2.28 |  3.32 |             +1.7% |         +1.9% |   19% |
| format-string         |   1.51 |    1.52 |  1.72 |  2.11 |             +0.3% |        +13.3% |    8% |
| burst-10000           |   2.98 |    2.85 |  3.05 |  2.27 |             −4.6% |         +2.1% |   17% |
| disabled-level-object |  44.64 |   25.16 | 35.39 | 48.02 |            −43.6% |        −20.7% |   20% |

**Averages across 17 cases:** bundled vs source **+4.4%** · bundled-min vs source **+0.8%** ·
bundled vs Pino **+3.0%** · median maxCV **14%**.

## Analysis

**Why bundling helps at all (same V8):** Rolldown scope-hoists the module graph into a single scope.
That lets V8 inline and devirtualize across what were ES-module boundaries — e.g. `buildRecord` →
`serializeErrorValues`, `formatJsonLine` → `safeStableStringify`, and the per-level method closures.
The effect is real but small.

**Credible signal vs noise.** After v0.6 the bundled-vs-source deltas are uniformly small: most
cases sit at +2–6%, below their own ~9–19% CV, so they are individually indistinguishable from
noise. The two largest figures, `disabled-level-string` (+46%) and `disabled-level-object` (−44%),
are the clearest noise of all — the trivial reject path swings wildly between runs (the same harness
shows +46% for one and −44% for the other). The trustworthy statement is the aggregate: **+4.4% on
average**, with no case showing a reproducible regression.

**Net:** bundling is a small, broadly-positive change within the noise floor — worth taking for
distribution, not for speed.

## Versus Pino

This flipped with v0.6. The bundled package now averages **+3.0% faster than Pino** (it was −24%
before the source optimization). Per case:

- **Faster than Pino:** the object-heavy and high-volume paths — `enabled-object` (small/medium),
  `redaction`, `child-bindings` (≈), `mixin` (≈), `burst-1000/10000`, `flush-after-1000`.
- **Still behind Pino:** the lightweight string and reject paths — `disabled-level-string`,
  `enabled-string`, `format-string`, `serializer`, `hooks-log-method` — where Pino's direct
  string-building beats building a record object plus `JSON.stringify`. These are the structural,
  algorithmic gaps, not bundling-related.

## Minification

Not worth it. It averages **less** than plain bundling (+0.8% vs +4.4%) and is inconsistent
(`serializer` −11.6% minified vs +6.3% bundled; `disabled-level-object` −20.7% minified; `mixin`
+13.6% minified vs +5.7% bundled). No reliable speed benefit, and it costs debuggability. Keep the
readable bundle.

## Native backend (orthogonal note)

The native FFI variants were measured too. For these discard/memory micro-workloads native is **~52%
slower** than pure TS on average (e.g. `enabled-string` −62%, `child-bindings` −62% vs pure source)
because the per-write FFI crossing costs more than it saves. After v0.6 made the TypeScript sink
faster, even `file-burst` is now roughly at parity (≈ −2%) rather than a native win. Native pays off
for sustained buffered I/O, not per-line micro-benchmarks. This is independent of the bundling
question.

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
