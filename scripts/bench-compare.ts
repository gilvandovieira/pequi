const command = new Deno.Command("deno", {
  args: [
    "bench",
    "--allow-read",
    "--allow-write",
    "--allow-ffi",
    "bench/compare/**/*.bench.ts",
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const status = await command.spawn().status;
Deno.exit(status.code);
