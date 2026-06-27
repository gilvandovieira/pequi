const reportDir = new URL("../reports/", import.meta.url);
const benchReportDir = new URL("../bench/reports/", import.meta.url);

await Deno.mkdir(reportDir, { recursive: true });
await Deno.mkdir(benchReportDir, { recursive: true });

console.log("Benchmark report collection is not automated yet.");
console.log("");
console.log("Run comparison benchmarks with:");
console.log("  deno task bench:compare");
console.log("");
console.log("Save Deno bench output manually under reports/ for now.");
console.log("Native attempts can be run separately with:");
console.log("  deno task bench:compare:native");
