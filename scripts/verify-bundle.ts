// Rebuilds the distributed bundle and asserts the committed artifacts are byte-identical to a clean
// build of the current source. Rolldown output is deterministic, so any drift means the committed
// (and published) `dist/` bundle is stale relative to `mod.ts`. CI runs this as a gate.
import { buildBundle } from "./build-bundle.ts";

const artifacts = [
  "dist/pequi.bundle.js",
  "dist/pequi.bundle.js.map",
  "dist/pequi.bundle.d.ts",
];

async function digest(path: string): Promise<string | null> {
  try {
    const bytes = await Deno.readFile(path);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
}

const committed = new Map<string, string | null>();
for (const path of artifacts) {
  committed.set(path, await digest(path));
}

// `buildBundle` cleans and regenerates the normal bundle, sourcemap, and type shim (not minified).
await buildBundle();

const drifted: string[] = [];
for (const path of artifacts) {
  if ((await digest(path)) !== committed.get(path)) {
    drifted.push(path);
  }
}

if (drifted.length > 0) {
  console.error("Bundle is stale — committed artifacts differ from a clean build:");
  for (const path of drifted) {
    console.error(`  - ${path}`);
  }
  console.error("\nRun `deno task bundle` and commit the updated dist/ artifacts.");
  Deno.exit(1);
}

console.log("Bundle is fresh: committed dist/ artifacts match a clean build of the source.");
