import { build } from "esbuild";
import {
  mkdir,
  cp,
  readFile,
  writeFile,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
await mkdir("assets", { recursive: true });
await mkdir("vendor", { recursive: true });
const result = await build({
  entryPoints: {
    main: "src/main.js",
    "process.worker": "src/process.worker.js",
    "ai.worker": "src/ai.worker.js",
  },
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["chrome110", "firefox115", "safari17"],
  outdir: "assets",
  entryNames: "[name]",
  chunkNames: "chunk-[hash]",
  minify: true,
  metafile: true,
  legalComments: "linked",
  logLevel: "warning",
});
const copies = [
  [
    "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    "vendor/pdf.worker.min.mjs",
  ],
  ["node_modules/pdfjs-dist/cmaps", "vendor/cmaps"],
  ["node_modules/pdfjs-dist/standard_fonts", "vendor/standard_fonts"],
  ["node_modules/@ffmpeg/ffmpeg/dist/esm", "vendor/ffmpeg"],
  ["node_modules/@ffmpeg/core/dist/esm", "vendor/ffmpeg-core"],
  [
    "node_modules/@jsquash/avif/codec/enc/avif_enc.js",
    "vendor/avif/avif_enc.js",
  ],
  [
    "node_modules/@jsquash/avif/codec/enc/avif_enc.wasm",
    "vendor/avif/avif_enc.wasm",
  ],
  ["node_modules/@jsquash/avif/meta.js", "vendor/avif/meta.js"],
  ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "vendor/DejaVuSans.ttf"],
];
for (const [src, dest] of copies) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
}
await mkdir("vendor/ort", { recursive: true });
for (const name of await readdir("node_modules/onnxruntime-web/dist"))
  if (name.startsWith("ort-wasm") && /\.(wasm|mjs)$/.test(name))
    await cp("node_modules/onnxruntime-web/dist/" + name, "vendor/ort/" + name);
const ocrSource = "/home/fabiano/public_html/app/scanner/vendor";
await mkdir("vendor/ocr", { recursive: true });
for (const name of await readdir(ocrSource))
  if (
    name.startsWith("tesseract-core") ||
    /^(por|eng)\.traineddata\.gz$/.test(name)
  )
    await cp(path.join(ocrSource, name), path.join("vendor/ocr", name));
await cp(
  "node_modules/tesseract.js/dist/worker.min.js",
  "vendor/ocr/worker.min.js",
);
await cp(
  "/usr/share/doc/fonts-dejavu-core/copyright",
  "vendor/licenses-font-DejaVu.txt",
);
const notices = [];
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("vendor/licenses", { recursive: true });
for (const name of Object.keys(pkg.dependencies)) {
  const folder = "node_modules/" + name,
    meta = JSON.parse(await readFile(folder + "/package.json", "utf8"));
  let licenseFile = (await readdir(folder)).find((n) =>
    /^licen[sc]e(\.|$)/i.test(n),
  );
  if (licenseFile)
    await cp(
      folder + "/" + licenseFile,
      "vendor/licenses/" + name.replaceAll("/", "-") + ".txt",
    );
  notices.push(
    `## ${name} ${meta.version}\nLicense: ${meta.license || "See package source"}\nSource: ${typeof meta.repository === "string" ? meta.repository : meta.repository?.url || meta.homepage || ""}\n`,
  );
}
await writeFile(
  "THIRD_PARTY_NOTICES.md",
  "# TinyLab — Third-party software / Software de terceiros\n\n" +
    notices.join("\n") +
    "\nFFmpeg core is distributed unmodified. Source and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm and https://github.com/ffmpegwasm/ffmpeg.wasm-core\nOCR language data: https://github.com/tesseract-ocr/tessdata_fast\nFont: DejaVu Sans, https://dejavu-fonts.github.io/\nModels downloaded on demand: onnx-community/ormbg-ONNX (Apache-2.0), Xenova/modnet (Apache-2.0), Xenova/swin2SR-classical-sr-x2-64 (Apache-2.0), Xenova/whisper-tiny (Apache-2.0), onnx-community/Qwen2.5-0.5B-Instruct (Apache-2.0), onnx-community/Qwen2.5-1.5B-Instruct (Apache-2.0). See model cards for details.\n",
);
const outputs = Object.keys(result.metafile.outputs);
const required = new Set(["assets/main.js"]);
function staticImports(file) {
  for (const i of result.metafile.outputs[file]?.imports || [])
    if (i.kind === "import-statement" && !i.external && !required.has(i.path)) {
      required.add(i.path);
      staticImports(i.path);
    }
}
staticImports("assets/main.js");
async function walk(dir) {
  let all = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) all.push(...(await walk(p)));
    else all.push(p);
  }
  return all;
}
// Remove obsolete generated chunks only; preserve source and user assets.
for (const f of await readdir("assets"))
  if (
    /^(chunk-|main\.|process\.worker\.|ai\.worker\.)/.test(f) &&
    !outputs.includes("assets/" + f)
  )
    await rm("assets/" + f);
const assets = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./favicon-32x32.png",
  "./favicon.ico",
  "./icon-96.png",
  "./icon-192.png",
  "./icon-512.png",
  ...outputs.map((p) => "./" + p),
  ...(await walk("vendor")).map((p) => "./" + p),
  "./THIRD_PARTY_NOTICES.md",
];
const hash = createHash("sha256");
for (const p of [...(await walk("src")), "style.css", "index.html"])
  hash.update(await readFile(p));
const cache = "tinylab-v2-" + hash.digest("hex").slice(0, 12);
const core = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./favicon-32x32.png",
  "./favicon.ico",
  "./icon-96.png",
  "./icon-192.png",
  "./icon-512.png",
  ...required,
].map((p) => (p.startsWith("./") ? p : "./" + p));
await writeFile(
  "offline-assets.json",
  JSON.stringify({ cache, assets }, null, 2),
);
await writeFile(
  "sw.js",
  `const CACHE=${JSON.stringify(cache)};\nconst CORE=${JSON.stringify(core)};\nself.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});\nself.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('tinylab-v2-')||key==='tinylab-cache-v1')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});\nself.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL('./',self.location.href);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||u.pathname.includes('/api/')||u.pathname.endsWith('.php')||e.request.headers.has('range'))return;e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(e.request);if(response.ok&&response.type!=='opaque'&&!response.headers.get('cache-control')?.includes('no-store'))await cache.put(e.request,response.clone());return response;}catch(err){const cached=await cache.match(e.request);if(cached)return cached;if(e.request.mode==='navigate')return cache.match(new URL('index.html',base));throw err;}})());});\n`,
);
await writeFile(
  "build-meta.json",
  JSON.stringify(
    {
      version: pkg.version,
      tools: (await import("../src/catalog.js")).tools.length,
      cache,
      files: outputs.length,
    },
    null,
    2,
  ),
);
console.log(
  `TinyLab ${pkg.version}: ${(await import("../src/catalog.js")).tools.length} tools, ${outputs.length} bundles. Cache ${cache}.`,
);
