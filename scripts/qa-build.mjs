import { build } from "esbuild";
await build({
  entryPoints: { runner: "tests/browser.mjs" },
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  outdir: "qa",
  chunkNames: "qa-[hash]",
  logLevel: "warning",
});
