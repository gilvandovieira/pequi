const reportPath = Deno.args[0];

if (reportPath === undefined) {
  console.log("No benchmark report supplied. Regression assertion is a scaffold placeholder.");
  Deno.exit(0);
}

const report = await Deno.readTextFile(reportPath);
if (report.trim().length === 0) {
  throw new Error(`Benchmark report is empty: ${reportPath}`);
}

console.log(`Benchmark report loaded: ${reportPath}`);
