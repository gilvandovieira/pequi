// Build native Rust artifacts.
//
//   deno task native:build            host target only (default)
//   deno task native:build:x64        --target linux-x86_64-gnu
//   deno task native:build:aarch64    --target linux-aarch64-gnu
//   deno task native:build:windows    --target windows-x86_64-gnu
//   deno task native:build:all        --all (every configured target)
//
// Cross-building emits an artifact for another target; it does NOT make that artifact loadable or
// testable through Deno FFI on this machine. Runtime testing needs a matching OS/CPU (see
// NATIVE.md). Cross targets also need their Rust target and a system cross linker installed; cargo
// fails with a clear error if the toolchain is missing.

import { hostTarget, isHostTarget, NATIVE_TARGETS, type NativeTarget } from "./native-targets.ts";

const rustDir = new URL("../native/rust/", import.meta.url);

const requested = parseTargets(Deno.args);
if (requested.length === 0) {
  Deno.exit(1);
}

const cargo = resolveCargoCommand();
console.log(`Cargo: ${cargo}`);

const failures: string[] = [];
for (const target of requested) {
  const ok = await buildTarget(target);
  if (!ok) {
    failures.push(target.pequiTarget);
  }
}

if (failures.length > 0) {
  console.error(`\nNative build failed for: ${failures.join(", ")}`);
  Deno.exit(1);
}

async function buildTarget(target: NativeTarget): Promise<boolean> {
  const host = isHostTarget(target);
  console.log(
    `\nBuilding ${target.pequiTarget} (${target.rustTriple})${host ? " [host]" : " [cross]"}`,
  );

  const args = host
    ? ["build", "--release"]
    : ["build", "--release", "--target", target.rustTriple];

  const status = await new Deno.Command(cargo, {
    args,
    cwd: rustDir,
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;

  if (!status.success) {
    console.error(
      `cargo build for ${target.rustTriple} failed (exit ${status.code}). ` +
        (host
          ? ""
          : "Cross builds need `rustup target add` plus a system cross linker — see NATIVE.md."),
    );
    return false;
  }

  const releaseDir = host ? "target/release/" : `target/${target.rustTriple}/release/`;
  const source = new URL(`${releaseDir}${target.artifact}`, rustDir);
  const destination = new URL(
    `../prebuilt/${target.pequiTarget}/${target.artifact}`,
    import.meta.url,
  );

  await Deno.mkdir(new URL(".", destination), { recursive: true });
  await Deno.copyFile(source, destination);
  console.log(`Copied ${source.pathname}`);
  console.log(`to     ${destination.pathname}`);
  return true;
}

function parseTargets(args: readonly string[]): NativeTarget[] {
  if (args.includes("--all")) {
    return [...NATIVE_TARGETS];
  }

  const flagIndex = args.indexOf("--target");
  if (flagIndex !== -1) {
    const name = args[flagIndex + 1];
    const target = NATIVE_TARGETS.find((candidate) => candidate.pequiTarget === name);
    if (target === undefined) {
      console.error(
        `Unknown --target "${name ?? ""}". Known targets: ` +
          NATIVE_TARGETS.map((candidate) => candidate.pequiTarget).join(", "),
      );
      return [];
    }
    return [target];
  }

  const host = hostTarget();
  if (host === undefined) {
    console.error(
      `Unsupported native build host: ${Deno.build.os}/${Deno.build.arch}. ` +
        "Pass --target <name> to cross-build a configured target.",
    );
    return [];
  }
  return [host];
}

function resolveCargoCommand(): string {
  // Cross-building uses the host toolchain's cargo with an added target, not a per-triple cargo.
  const cargoFromEnv = Deno.env.get("CARGO");
  if (cargoFromEnv !== undefined && cargoFromEnv.length > 0) {
    return cargoFromEnv;
  }

  const host = hostTarget();
  const home = Deno.env.get("HOME");
  if (host !== undefined && home !== undefined && home.length > 0) {
    const stableCargo = `${home}/.rustup/toolchains/stable-${host.rustTriple}/bin/cargo`;
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
