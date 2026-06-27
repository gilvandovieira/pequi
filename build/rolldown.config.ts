import { defineConfig } from "rolldown";

export default defineConfig({
  input: "mod.ts",
  platform: "neutral",
  external: isExternal,
  transform: {
    target: "esnext",
  },
  output: {
    file: "dist/pequi.bundle.js",
    format: "esm",
    sourcemap: true,
    banner: `// @ts-self-types="./pequi.bundle.d.ts"`,
    minify: false,
  },
});

function isExternal(id: string): boolean {
  return id === "pino" ||
    id === "npm:pino" ||
    id.startsWith("pino/") ||
    id.startsWith("npm:pino/") ||
    id.endsWith(".so") ||
    id.includes("/bench/") ||
    id.includes("/tests/");
}
