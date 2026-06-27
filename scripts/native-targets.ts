// Canonical native target table — the single source of truth shared by the build and
// artifact-verification scripts. Cross-building produces these artifacts; it does NOT mean the
// current machine can load them through Deno FFI (see NATIVE.md "Cross-compilation").

export interface NativeTarget {
  /** Pequi target name == the `prebuilt/<name>/` directory. */
  pequiTarget: "linux-x86_64-gnu" | "linux-aarch64-gnu" | "windows-x86_64-gnu";
  /** Rust target triple passed to `cargo build --target`. */
  rustTriple:
    | "x86_64-unknown-linux-gnu"
    | "aarch64-unknown-linux-gnu"
    | "x86_64-pc-windows-gnu";
  /** Output dynamic-library filename produced by the `pequi_log` cdylib crate. */
  artifact: "libpequi_log.so" | "pequi_log.dll";
  /** Expected file extension. */
  extension: ".so" | ".dll";
  /** Binary container format, used to read architecture metadata. */
  format: "elf" | "pe";
  /** Expected machine id: ELF `e_machine` or PE COFF `Machine`. */
  machine: number;
  /** Deno `build.os`/`build.arch` that can run this artifact through FFI. */
  hostOs: typeof Deno.build.os;
  hostArch: typeof Deno.build.arch;
}

export const NATIVE_TARGETS: readonly NativeTarget[] = [
  {
    pequiTarget: "linux-x86_64-gnu",
    rustTriple: "x86_64-unknown-linux-gnu",
    artifact: "libpequi_log.so",
    extension: ".so",
    format: "elf",
    machine: 0x3e, // EM_X86_64
    hostOs: "linux",
    hostArch: "x86_64",
  },
  {
    pequiTarget: "linux-aarch64-gnu",
    rustTriple: "aarch64-unknown-linux-gnu",
    artifact: "libpequi_log.so",
    extension: ".so",
    format: "elf",
    machine: 0xb7, // EM_AARCH64
    hostOs: "linux",
    hostArch: "aarch64",
  },
  {
    pequiTarget: "windows-x86_64-gnu",
    rustTriple: "x86_64-pc-windows-gnu",
    artifact: "pequi_log.dll",
    extension: ".dll",
    format: "pe",
    machine: 0x8664, // IMAGE_FILE_MACHINE_AMD64
    hostOs: "windows",
    hostArch: "x86_64",
  },
] as const;

export function findTarget(name: string): NativeTarget | undefined {
  return NATIVE_TARGETS.find((target) => target.pequiTarget === name);
}

/** The target the current Deno process can both build natively and load through FFI. */
export function hostTarget(): NativeTarget | undefined {
  return NATIVE_TARGETS.find(
    (target) => target.hostOs === Deno.build.os && target.hostArch === Deno.build.arch,
  );
}

export function isHostTarget(target: NativeTarget): boolean {
  return target.hostOs === Deno.build.os && target.hostArch === Deno.build.arch;
}
