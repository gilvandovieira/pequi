// Verify prebuilt native artifacts.
//
// This checks that a built artifact EXISTS, lives in the right folder under the right name/
// extension, and carries the expected architecture metadata in its binary header. It deliberately
// does NOT prove the artifact can be loaded through Deno FFI on this machine, nor that its runtime
// behavior (writes, flush, close) is correct on the target platform — that requires a runtime test
// on a matching OS/CPU. See NATIVE.md "What verification means".
//
//   deno task native:verify:artifacts
//
// Missing artifacts are reported but tolerated (cross targets may not be built locally). Exit is
// non-zero only when an artifact that IS present fails validation.

import { NATIVE_TARGETS, type NativeTarget } from "./native-targets.ts";

type Outcome =
  | { status: "missing" }
  | { status: "ok"; detail: string }
  | { status: "fail"; detail: string };

const prebuiltDir = new URL("../prebuilt/", import.meta.url);
const rows: { target: NativeTarget; outcome: Outcome }[] = [];

for (const target of NATIVE_TARGETS) {
  const path = new URL(`${target.pequiTarget}/${target.artifact}`, prebuiltDir);
  rows.push({ target, outcome: await verify(target, path) });
}

const width = Math.max(...NATIVE_TARGETS.map((target) => target.pequiTarget.length));
console.log("Native artifact verification:\n");
let failed = false;
for (const { target, outcome } of rows) {
  const name = target.pequiTarget.padEnd(width);
  if (outcome.status === "missing") {
    console.log(`  MISSING  ${name}  ${target.artifact} (not built locally — tolerated)`);
  } else if (outcome.status === "ok") {
    console.log(`  OK       ${name}  ${outcome.detail}`);
  } else {
    failed = true;
    console.log(`  FAIL     ${name}  ${outcome.detail}`);
  }
}

if (failed) {
  console.error("\nNative artifact verification failed.");
  Deno.exit(1);
}
console.log("\nNative artifact verification passed (present artifacts look correct).");

async function verify(target: NativeTarget, path: URL): Promise<Outcome> {
  let bytes: Uint8Array;
  try {
    bytes = (await Deno.readFile(path)).subarray(0, 4096);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { status: "missing" };
    }
    return { status: "fail", detail: `could not read: ${stringifyError(error)}` };
  }

  if (!path.pathname.endsWith(target.extension)) {
    return { status: "fail", detail: `expected ${target.extension} extension` };
  }

  const machine = target.format === "elf" ? readElfMachine(bytes) : readPeMachine(bytes);
  if (machine === undefined) {
    return { status: "fail", detail: `not a valid ${target.format.toUpperCase()} binary` };
  }
  if (machine !== target.machine) {
    return {
      status: "fail",
      detail: `${target.format.toUpperCase()} machine 0x${machine.toString(16)}, ` +
        `expected 0x${target.machine.toString(16)}`,
    };
  }

  return {
    status: "ok",
    detail: `${target.artifact} · ${target.format.toUpperCase()} machine ` +
      `0x${machine.toString(16)}`,
  };
}

function readElfMachine(bytes: Uint8Array): number | undefined {
  // ELF magic 0x7F 'E' 'L' 'F'; EI_DATA at offset 5 (1 = LE, 2 = BE); e_machine (u16) at offset 18.
  if (
    bytes.length < 20 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c ||
    bytes[3] !== 0x46
  ) {
    return undefined;
  }
  const littleEndian = bytes[5] !== 2;
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(18, littleEndian);
}

function readPeMachine(bytes: Uint8Array): number | undefined {
  // DOS header magic 'MZ'; e_lfanew (u32 LE) at 0x3C points to "PE\0\0"; COFF Machine (u16 LE) at +4.
  if (bytes.length < 0x40 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset + 6 > bytes.length) {
    return undefined;
  }
  if (bytes[peOffset] !== 0x50 || bytes[peOffset + 1] !== 0x45) {
    return undefined; // not "PE"
  }
  return view.getUint16(peOffset + 4, true);
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
