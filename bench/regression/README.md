# Benchmark Regression Baselines

`baseline.json` stores native benchmark thresholds and, once updated, benchmark values used by
`scripts/assert-regression.ts`.

The initial baseline intentionally has no measured benchmark values. This lets the threshold policy
land before CI starts enforcing timing on noisy local machines.

Update the baseline after collecting a native benchmark report:

```sh
deno task bench:native:compare
deno run --allow-read --allow-write --allow-run scripts/update-baseline.ts \
  bench/reports/native-current.json bench/regression/baseline.json
```

Regression thresholds:

- Disabled-level benchmarks: hard fail above 10% slower.
- Format-only benchmarks: hard fail above 15% slower.
- Native burst/file benchmarks: hard fail above 20% slower once baseline values exist.
- Pure-vs-native integration and memory/RSS results: informational at first.
