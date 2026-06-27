const rustDir = new URL("../native/rust/", import.meta.url).pathname;
const target = Deno.args[0] ?? currentRustTarget();
const args = ["build", "--release"];

if (target !== undefined) {
  args.push("--target", target);
}

const command = new Deno.Command("cargo", {
  args,
  cwd: rustDir,
  stdout: "inherit",
  stderr: "inherit",
});

const child = command.spawn();
const status = await child.status;
if (!status.success) {
  Deno.exit(status.code);
}

const prebuiltTarget = prebuiltTargetFor(target);
if (prebuiltTarget === undefined) {
  console.log("Native build completed. No prebuilt copy target is configured for this platform.");
  Deno.exit(0);
}

const releaseDir = target === undefined ? "target/release" : `target/${target}/release`;
const source = new URL(
  `${releaseDir}/libpequi_native.so`,
  new URL("../native/rust/", import.meta.url),
);
const destination = new URL(`../prebuilt/${prebuiltTarget}/libpequi_native.so`, import.meta.url);

await Deno.mkdir(new URL(".", destination), { recursive: true });
await Deno.copyFile(source, destination);
console.log(`Copied native library to ${destination.pathname}`);

function currentRustTarget(): string | undefined {
  if (Deno.build.os !== "linux") {
    return undefined;
  }

  if (Deno.build.arch === "x86_64") {
    return "x86_64-unknown-linux-gnu";
  }

  if (Deno.build.arch === "aarch64") {
    return "aarch64-unknown-linux-gnu";
  }

  return undefined;
}

function prebuiltTargetFor(targetName: string | undefined): string | undefined {
  if (targetName === "x86_64-unknown-linux-gnu") {
    return "linux-x86_64-gnu";
  }

  if (targetName === "aarch64-unknown-linux-gnu") {
    return "linux-aarch64-gnu";
  }

  return undefined;
}
