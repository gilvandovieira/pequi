export async function runBench(args: string[] = Deno.args): Promise<number> {
  const command = new Deno.Command("deno", {
    args: ["bench", "--allow-read", "--allow-write", ...args],
    stdout: "inherit",
    stderr: "inherit",
  });

  const child = command.spawn();
  const status = await child.status;
  return status.code;
}

if (import.meta.main) {
  Deno.exit(await runBench());
}
