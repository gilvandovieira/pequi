import {
  getNativeLoadInfo,
  loadNativeLibrary,
  type NativeLibrary,
} from "../src/backends/native.ts";

const loadInfo = getNativeLoadInfo();

console.log(`Detected OS: ${loadInfo.os}`);
console.log(`Detected architecture: ${loadInfo.arch}`);
console.log(
  `Attempted library path: ${
    loadInfo.attemptedLibraryPaths.length === 0 ? "none" : loadInfo.attemptedLibraryPaths.join(", ")
  }`,
);

try {
  const loaded = loadNativeLibrary();
  console.log(`Loaded library: ${loaded.libraryPath}`);
  console.log(`ABI version: ${loaded.abiVersion}`);

  try {
    runDiscardCheck(loaded.library);
  } finally {
    loaded.library.close();
  }

  console.log("Native backend discard write/flush/drop check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}

function runDiscardCheck(library: NativeLibrary): void {
  const empty = new Uint8Array(0);
  const handle = library.symbols.pequi_init(0, empty, 0n, 0n);
  if (handle === null) {
    throw new Error("pequi_init returned a null handle for discard destination.");
  }

  try {
    const line = new TextEncoder().encode('{"level":30,"msg":"native check"}\n');
    const writeCode = library.symbols.pequi_write(handle, line, BigInt(line.byteLength));
    if (writeCode !== 0) {
      throw new Error(`pequi_write failed with status ${writeCode}.`);
    }

    const flushCode = library.symbols.pequi_flush(handle);
    if (flushCode !== 0) {
      throw new Error(`pequi_flush failed with status ${flushCode}.`);
    }
  } finally {
    library.symbols.pequi_drop(handle);
  }
}
