const rustDir = new URL("../native/rust/", import.meta.url);
const hostTarget = currentHostTarget();

if (hostTarget === undefined) {
  console.error(
    `Unsupported native build host: ${Deno.build.os}/${Deno.build.arch}. ` +
      "Only linux/x86_64 and linux/aarch64 host builds are wired for this alpha.",
  );
  Deno.exit(1);
}

console.log(`Building Pequi native backend for ${hostTarget.prebuiltTarget}`);
console.log(`Rust crate: ${rustDir.pathname}`);

const cargo = resolveCargoCommand(hostTarget.rustTargetTriple);
console.log(`Cargo: ${cargo}`);

const command = new Deno.Command(cargo, {
  args: ["build", "--release"],
  cwd: rustDir,
  stdout: "inherit",
  stderr: "inherit",
});

const status = await command.spawn().status;
if (!status.success) {
  console.error(`cargo build --release failed with exit code ${status.code}`);
  Deno.exit(status.code);
}

const source = new URL("target/release/libpequi_log.so", rustDir);
const destination = new URL(
  `../prebuilt/${hostTarget.prebuiltTarget}/libpequi_log.so`,
  import.meta.url,
);

await Deno.mkdir(new URL(".", destination), { recursive: true });
await Deno.copyFile(source, destination);

console.log(`Copied ${source.pathname}`);
console.log(`to     ${destination.pathname}`);
console.log("Cross-compilation is planned but not implemented by this script yet.");

interface HostTarget {
  prebuiltTarget: "linux-x86_64-gnu" | "linux-aarch64-gnu";
  rustTargetTriple: "x86_64-unknown-linux-gnu" | "aarch64-unknown-linux-gnu";
}

function currentHostTarget(): HostTarget | undefined {
  if (Deno.build.os !== "linux") {
    return undefined;
  }

  if (Deno.build.arch === "x86_64") {
    return {
      prebuiltTarget: "linux-x86_64-gnu",
      rustTargetTriple: "x86_64-unknown-linux-gnu",
    };
  }

  if (Deno.build.arch === "aarch64") {
    return {
      prebuiltTarget: "linux-aarch64-gnu",
      rustTargetTriple: "aarch64-unknown-linux-gnu",
    };
  }

  return undefined;
}

function resolveCargoCommand(rustTargetTriple: HostTarget["rustTargetTriple"]): string {
  const cargoFromEnv = Deno.env.get("CARGO");
  if (cargoFromEnv !== undefined && cargoFromEnv.length > 0) {
    return cargoFromEnv;
  }

  const home = Deno.env.get("HOME");
  if (home !== undefined && home.length > 0) {
    const stableCargo = `${home}/.rustup/toolchains/stable-${rustTargetTriple}/bin/cargo`;
    if (isExecutableFile(stableCargo)) {
      return stableCargo;
    }
  }

  return "cargo";
}

function isExecutableFile(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}
