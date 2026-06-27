const normalBundlePath = "dist/pequi.bundle.js";
const normalMapPath = "dist/pequi.bundle.js.map";
const typePath = "dist/pequi.bundle.d.ts";
const minBundlePath = "dist/pequi.bundle.min.js";
const minMapPath = "dist/pequi.bundle.min.js.map";

const bundleArtifacts = [
  normalBundlePath,
  normalMapPath,
  typePath,
  minBundlePath,
  minMapPath,
];

interface PequiBundleModule {
  pequi(options?: Record<string, unknown>): {
    info(message: string): void;
    flush(): void | Promise<void>;
  };
}

export interface BundleBuildResult {
  rolldownVersion: string;
  normal: BundleArtifactInfo;
  types: TypeArtifactInfo;
  minified?: BundleArtifactInfo;
  minifiedSkippedReason?: string;
}

export interface BundleArtifactInfo {
  path: string;
  mapPath: string;
  bytes: number;
  mapBytes: number;
}

export interface TypeArtifactInfo {
  path: string;
  bytes: number;
}

export interface BuildBundleOptions {
  minify?: boolean;
}

export async function buildBundle(options: BuildBundleOptions = {}): Promise<BundleBuildResult> {
  await cleanBundleArtifacts();
  await Deno.mkdir("dist", { recursive: true });

  await runRolldown("normal");
  const types = await writeBundleTypes();
  const normal = await verifyArtifact(normalBundlePath, normalMapPath);
  await smokeImport(normalBundlePath);

  let minified: BundleArtifactInfo | undefined;
  let minifiedSkippedReason: string | undefined;
  if (options.minify === true) {
    try {
      await runRolldown("min");
      minified = await verifyArtifact(minBundlePath, minMapPath);
    } catch (error) {
      minifiedSkippedReason = errorMessage(error);
      console.warn(`Experimental minified bundle skipped: ${minifiedSkippedReason}`);
    }
  }

  return {
    rolldownVersion: await readLockedNpmVersion("rolldown") ?? "unknown",
    normal,
    types,
    minified,
    minifiedSkippedReason,
  };
}

async function runRolldown(configName: "normal" | "min"): Promise<void> {
  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-sys",
      "--allow-ffi",
      "scripts/build-bundle-rolldown.ts",
      configName,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.output();
  if (!status.success) {
    throw new Error(`Rolldown failed for ${configName} bundle with exit code ${status.code}`);
  }
}

async function cleanBundleArtifacts(): Promise<void> {
  for (const path of bundleArtifacts) {
    try {
      await Deno.remove(path);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }
}

async function verifyArtifact(path: string, mapPath: string): Promise<BundleArtifactInfo> {
  const [bundle, map] = await Promise.all([Deno.stat(path), Deno.stat(mapPath)]);
  if (!bundle.isFile) {
    throw new Error(`Expected bundle file at ${path}`);
  }
  if (!map.isFile) {
    throw new Error(`Expected sourcemap file at ${mapPath}`);
  }
  return { path, mapPath, bytes: bundle.size, mapBytes: map.size };
}

async function writeBundleTypes(): Promise<TypeArtifactInfo> {
  const contents = [
    `export * from "../mod.ts";`,
    `export { default } from "../mod.ts";`,
    "",
  ].join("\n");
  await Deno.writeTextFile(typePath, contents);
  const stat = await Deno.stat(typePath);
  return { path: typePath, bytes: stat.size };
}

async function smokeImport(path: string): Promise<void> {
  const moduleUrl = pathToFileUrl(path);
  moduleUrl.searchParams.set("smoke", String(Date.now()));
  const module = await import(moduleUrl.href) as PequiBundleModule;
  const lines: string[] = [];
  const log = module.pequi({
    native: false,
    timestamp: false,
    base: null,
    destination: {
      write(chunk: string): boolean {
        lines.push(chunk);
        return true;
      },
      flush(): void {},
    },
  });

  log.info("bundle smoke");
  await log.flush();

  if (lines.length !== 1) {
    throw new Error(`Expected bundled smoke test to write one line, got ${lines.length}`);
  }
}

function pathToFileUrl(path: string): URL {
  return new URL(path, `file://${Deno.cwd()}/`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readLockedNpmVersion(packageName: string): Promise<string | undefined> {
  try {
    const lock = JSON.parse(await Deno.readTextFile("deno.lock")) as {
      specifiers?: Record<string, string>;
      npm?: Record<string, unknown>;
    };
    for (const [specifier, version] of Object.entries(lock.specifiers ?? {})) {
      if (specifier.startsWith(`npm:${packageName}@`)) {
        return version;
      }
    }
    const prefix = `${packageName}@`;
    return Object.keys(lock.npm ?? {})
      .find((entry) => entry.startsWith(prefix))
      ?.slice(prefix.length)
      .split("_")[0];
  } catch {
    return undefined;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

if (import.meta.main) {
  const result = await buildBundle({ minify: Deno.args.includes("--minify") });
  console.log(`Rolldown ${result.rolldownVersion}`);
  console.log(
    `${result.normal.path}: ${formatBytes(result.normal.bytes)} ` +
      `(${result.normal.mapPath}: ${formatBytes(result.normal.mapBytes)})`,
  );
  console.log(`${result.types.path}: ${formatBytes(result.types.bytes)}`);
  if (result.minified !== undefined) {
    console.log(
      `experimental ${result.minified.path}: ${formatBytes(result.minified.bytes)} ` +
        `(${result.minified.mapPath}: ${formatBytes(result.minified.mapBytes)})`,
    );
  }
}
