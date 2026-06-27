// Documentation coverage gate.
//
// Measures two things across the library source (mod.ts + src/**/*.ts) using `deno doc --json`:
//
//   1. Module-doc coverage  — share of files that have a module-level doc comment (`@module`).
//      Gate: 100% (every library file must carry a module doc).
//   2. Symbol-doc coverage  — share of exported symbols that have a JSDoc comment.
//      Gate: 80%.
//
// If either falls below its gate the check fails. It is wired into the pre-commit hook
// (.githooks/pre-commit) and can be run directly:
//
//   deno task doc:coverage                          # gate: module 100%, symbol 80%
//   deno task doc:coverage --min-symbol 90          # custom symbol threshold (percent)
//   deno task doc:coverage --min-module 100         # custom module threshold (percent)
//   deno task doc:coverage --verbose                # list every undocumented item
//
// Each symbol is counted only in the file that defines it (re-exports in mod.ts are not
// double-counted). Only the shipped library is measured; tests, benches, and scripts are excluded.

interface DenoDoc {
  nodes: Record<string, FileNode>;
}

interface FileNode {
  module_doc?: { doc?: string };
  symbols?: SymbolNode[];
}

interface SymbolNode {
  name: string;
  declarationKind?: string;
  jsDoc?: { doc?: string };
  declarations?: Declaration[];
}

interface Declaration {
  declarationKind?: string;
  kind?: string;
  jsDoc?: { doc?: string };
}

const root = new URL("../", import.meta.url);
const moduleThreshold = readThreshold(Deno.args, "--min-module", 100);
const symbolThreshold = readThreshold(Deno.args, "--min-symbol", 80);
const verbose = Deno.args.includes("--verbose");

const files = await collectLibraryFiles();
const doc = await runDenoDoc(files);

let totalModules = 0;
let documentedModules = 0;
let totalSymbols = 0;
let documentedSymbols = 0;
const undocumentedModules: string[] = [];
const undocumentedSymbols: string[] = [];

for (const [url, node] of Object.entries(doc.nodes)) {
  const file = relativize(url);

  totalModules += 1;
  if (hasDoc(node.module_doc?.doc)) {
    documentedModules += 1;
  } else {
    undocumentedModules.push(file);
  }

  for (const symbol of node.symbols ?? []) {
    // Count a symbol only in the file that defines it, so a re-export barrel (mod.ts) does not
    // double-count symbols already attributed to their source module.
    const owned = ownedExportDeclarations(symbol);
    if (owned.length === 0) {
      continue;
    }
    totalSymbols += 1;
    if (hasDoc(symbol.jsDoc?.doc) || owned.some((d) => hasDoc(d.jsDoc?.doc))) {
      documentedSymbols += 1;
    } else {
      undocumentedSymbols.push(`${file} → ${symbol.name}`);
    }
  }
}

const moduleCoverage = ratio(documentedModules, totalModules);
const symbolCoverage = ratio(documentedSymbols, totalSymbols);

console.log("Documentation coverage:\n");
console.log(
  `  Module docs:  ${documentedModules}/${totalModules}  (${pct(moduleCoverage)})  ` +
    `gate ${pct(moduleThreshold)}`,
);
console.log(
  `  Symbol docs:  ${documentedSymbols}/${totalSymbols}  (${pct(symbolCoverage)})  ` +
    `gate ${pct(symbolThreshold)}`,
);

if (verbose) {
  printList("Files missing a module doc", undocumentedModules);
  printList("Exported symbols missing JSDoc", undocumentedSymbols);
}

const failures: string[] = [];
if (moduleCoverage < moduleThreshold) {
  failures.push(`module-doc coverage ${pct(moduleCoverage)} is below ${pct(moduleThreshold)}`);
}
if (symbolCoverage < symbolThreshold) {
  failures.push(`symbol-doc coverage ${pct(symbolCoverage)} is below ${pct(symbolThreshold)}`);
}

if (failures.length > 0) {
  console.error("\nDocumentation coverage gate FAILED:");
  for (const failure of failures) {
    console.error(`  ✗ ${failure}`);
  }
  if (!verbose) {
    console.error("\nRun `deno task doc:coverage --verbose` to list the undocumented items.");
  }
  Deno.exit(1);
}

console.log("\nDocumentation coverage gate passed.");

async function collectLibraryFiles(): Promise<string[]> {
  const files = [pathOf(new URL("mod.ts", root))];
  for await (const file of walkTs(new URL("src/", root))) {
    files.push(file);
  }
  return files.sort();
}

async function* walkTs(dir: URL): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walkTs(new URL(`${entry.name}/`, dir));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      yield pathOf(new URL(entry.name, dir));
    }
  }
}

async function runDenoDoc(files: readonly string[]): Promise<DenoDoc> {
  const { success, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["doc", "--json", ...files],
    stdout: "piped",
    stderr: "piped",
  }).output();

  if (!success) {
    console.error(new TextDecoder().decode(stderr));
    throw new Error("`deno doc --json` failed");
  }
  return JSON.parse(new TextDecoder().decode(stdout)) as DenoDoc;
}

/**
 * Export declarations of `symbol` that are real definitions in this file, excluding re-export
 * references (deno doc marks a re-export with `kind: "reference"`), so a barrel like mod.ts does not
 * double-count symbols already attributed to their source module.
 */
function ownedExportDeclarations(symbol: SymbolNode): Declaration[] {
  const declarations = symbol.declarations ?? [];
  if (declarations.length === 0) {
    // Older deno-doc shape without a declarations array: trust the symbol-level export kind.
    return symbol.declarationKind === "export" ? [{ jsDoc: symbol.jsDoc }] : [];
  }
  return declarations.filter(
    (d) => d.declarationKind === "export" && d.kind !== "reference",
  );
}

function hasDoc(doc: string | undefined): boolean {
  return doc !== undefined && doc.trim().length > 0;
}

function ratio(part: number, total: number): number {
  return total === 0 ? 1 : part / total;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function readThreshold(args: readonly string[], flag: string, fallbackPercent: number): number {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallbackPercent / 100;
  }
  const raw = Number(args[index + 1]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    throw new Error(`Invalid ${flag} value: ${args[index + 1]}`);
  }
  return raw / 100;
}

function printList(title: string, items: readonly string[]): void {
  if (items.length === 0) {
    return;
  }
  console.log(`\n${title}:`);
  for (const item of items) {
    console.log(`  - ${item}`);
  }
}

function relativize(url: string): string {
  return url.startsWith(root.href) ? url.slice(root.href.length) : pathOf(new URL(url));
}

function pathOf(url: URL): string {
  return decodeURIComponent(url.pathname);
}
