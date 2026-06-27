const args = new Set(Deno.args);
const outputPath = valueAfter("--output");
const json = args.has("--json") || outputPath !== undefined;
const compare = args.has("--compare");

const benchFiles = compare
  ? ["bench/native/**/*.bench.ts", "bench/compare/native-writer.bench.ts"]
  : ["bench/native/**/*.bench.ts"];

const commandArgs = [
  "bench",
  "--allow-read",
  "--allow-write",
  "--allow-ffi",
  ...benchFiles,
];

if (json) {
  commandArgs.splice(1, 0, "--json");
}

const command = new Deno.Command("deno", {
  args: commandArgs,
  stdout: json ? "piped" : "inherit",
  stderr: "inherit",
});

const output = await command.output();
if (!output.success) {
  Deno.exit(output.code);
}

if (json) {
  const text = new TextDecoder().decode(output.stdout);
  if (outputPath !== undefined) {
    await Deno.mkdir(new URL(".", pathToFileUrl(outputPath)), { recursive: true });
    await Deno.writeTextFile(outputPath, text);
    console.log(`Wrote native benchmark JSON to ${outputPath}`);
  } else {
    console.log(text);
  }
}

function valueAfter(flag: string): string | undefined {
  const index = Deno.args.indexOf(flag);
  return index === -1 ? undefined : Deno.args[index + 1];
}

function pathToFileUrl(path: string): URL {
  return new URL(path, `file://${Deno.cwd()}/`);
}
