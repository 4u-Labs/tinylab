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
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { tools, categories } from "../src/catalog.js";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
{
  const catalogIds = new Set(tools.map((t) => t.id));
  const mainSrc = await readFile("src/main.js", "utf8");
  const indexHtml = await readFile("index.html", "utf8");
  const sliceBlock = (marker, closeToken) => {
    const start = mainSrc.indexOf(marker);
    if (start < 0) throw new Error(`Missing block in src/main.js: ${marker}`);
    const end = mainSrc.indexOf(closeToken, start);
    return mainSrc.slice(start, end);
  };
  const grab = (re, str) => [...str.matchAll(re)].map((m) => m[1]);
  const iconKeys = grab(
    /^\s+"?([a-z0-9-]+)"?:\s*"/gm,
    sliceBlock("const specificIcons = {", "};"),
  );
  const newIds = grab(
    /"([a-z0-9-]+)"/g,
    sliceBlock("const newToolIds = new Set([", "]);"),
  );
  const popIds = grab(
    /"([a-z0-9-]+)"/g,
    sliceBlock("const popularToolIds = new Set([", "]);"),
  );
  const featIds = grab(
    /"([a-z0-9-]+)"/g,
    sliceBlock("const featuredToolIds = [", "];"),
  );
  const recIds = grab(
    /"([a-z0-9]+(?:-[a-z0-9]+)+)"/g,
    sliceBlock(
      "function recommendToolsForFiles(incoming) {",
      "function filesForTool(",
    ),
  );
  const htmlToolIds = grab(/data-tool="([^"]+)"/g, indexHtml);
  const openLiterals = grab(/openTool\("([^"]+)"/g, mainSrc);
  const allRefs = [
    ...iconKeys,
    ...newIds,
    ...popIds,
    ...featIds,
    ...recIds,
    ...htmlToolIds,
    ...openLiterals,
  ];
  const unknown = [...new Set(allRefs)].filter((id) => !catalogIds.has(id));
  if (unknown.length) {
    throw new Error(
      `Build aborted — unknown tool IDs referenced in UI: ${unknown.join(", ")}`,
    );
  }
  const iconSet = new Set(iconKeys);
  const missingIcons = tools.filter((t) => !iconSet.has(t.id)).map((t) => t.id);
  if (missingIcons.length) {
    throw new Error(
      `Build aborted — tools missing from specificIcons: ${missingIcons.join(", ")}`,
    );
  }
}
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
if (existsSync(ocrSource)) {
  for (const name of await readdir(ocrSource))
    if (
      name.startsWith("tesseract-core") ||
      /^(por|eng)\.traineddata\.gz$/.test(name)
    )
      await cp(path.join(ocrSource, name), path.join("vendor/ocr", name));
}
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
  "./og-banner.jpg",
  "./og-banner.webp",
  ...outputs.map((p) => "./" + p),
  ...(await walk("vendor")).map((p) => "./" + p),
  "./THIRD_PARTY_NOTICES.md",
];
const cleanIndexHtml = (await readFile("index.html", "utf8")).replace(
  /\?v=[a-f0-9]+/g,
  "",
);
const hash = createHash("sha256");
for (const p of [...(await walk("src")), "style.css", "icon-192.png", "og-banner.jpg"])
  hash.update(await readFile(p));
hash.update(cleanIndexHtml);
const ver = hash.digest("hex").slice(0, 12);
const cache = "tinylab-v2-" + ver;
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
  `const CACHE=${JSON.stringify(cache)};\nconst CORE=${JSON.stringify(core)};\nself.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(u=>fetch(u,{cache:'reload'}).then(r=>r.ok?c.put(u,r):null)))));self.skipWaiting();});\nself.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('tinylab-v2-')||key==='tinylab-cache-v1')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});\nself.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL('./',self.location.href);if(e.request.method==='POST'&&u.origin===base.origin&&u.pathname.startsWith(base.pathname)&&u.searchParams.get('share-target')==='1'){e.respondWith((async()=>{const form=await e.request.formData();const sharedFiles=form.getAll('files').filter(f=>f&&typeof f.arrayBuffer==='function'&&f.size>0);const sharedText=[form.get('title'),form.get('text'),form.get('url')].filter(Boolean).join('\\n').trim();const cache=await caches.open(CACHE);const meta=[];for(let i=0;i<sharedFiles.length;i++){const f=sharedFiles[i],itemUrl=new URL('__shared_file_'+i+'__',base).href;await cache.put(itemUrl,new Response(f,{headers:{'Content-Type':f.type||'application/octet-stream'}}));meta.push({url:itemUrl,name:f.name||'shared-'+(i+1),type:f.type||'application/octet-stream',lastModified:f.lastModified||Date.now()});}await cache.put(new URL('__shared_meta__',base).href,new Response(JSON.stringify({files:meta,text:sharedText}),{headers:{'Content-Type':'application/json'}}));return Response.redirect(new URL('./?shared=1',base).href,303);})());return;}if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||u.pathname.includes('/api/')||u.pathname.endsWith('.php')||e.request.headers.has('range'))return;e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(e.request,{cache:'no-cache'});if(response.ok&&response.type!=='opaque'&&!response.headers.get('cache-control')?.includes('no-store'))await cache.put(e.request,response.clone());return response;}catch(err){const cached=(await cache.match(e.request))||(await cache.match(e.request,{ignoreSearch:true}));if(cached)return cached;if(e.request.mode==='navigate')return cache.match(new URL('index.html',base));throw err;}})());});\n`,
);

// Generate static SEO landing pages per internal tool + sitemap.xml
const SITE_BASE = "https://4u.ia.br/app/tinylab";
const escHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const rootHtml = cleanIndexHtml
  .replaceAll('href="favicon-32x32.png"', `href="favicon-32x32.png?v=${ver}"`)
  .replaceAll('href="icon-96.png"', `href="icon-96.png?v=${ver}"`)
  .replaceAll('href="favicon.ico"', `href="favicon.ico?v=${ver}"`)
  .replaceAll('href="icon-192.png"', `href="icon-192.png?v=${ver}"`)
  .replaceAll('href="manifest.json"', `href="manifest.json?v=${ver}"`)
  .replaceAll('href="style.css"', `href="style.css?v=${ver}"`)
  .replaceAll('src="assets/main.js"', `src="assets/main.js?v=${ver}"`)
  .replaceAll('src="icon-96.png"', `src="icon-96.png?v=${ver}"`)
  .replaceAll('src="icon-192.png"', `src="icon-192.png?v=${ver}"`);
await writeFile("index.html", rootHtml);
const internalTools = tools.filter((t) => !t.external);
for (const tool of internalTools) {
  const catObj = categories.find((c) => c.id === tool.category);
  const catPt = catObj ? catObj.label.pt : "Utilitários";
  const canonical = `${SITE_BASE}/${tool.id}/`;
  const pageTitle = `${tool.title.pt} Online Grátis — Sem Anúncios | TinyLab`;
  const metaDesc = `${tool.description.pt} Ferramenta online gratuita, sem cadastro, sem anúncios e com processamento privado no navegador (${tool.title.en}) — TinyLab por 4u-Labs.`;
  const privacyAnswer = tool.companion
    ? `Em ${tool.title.pt}, o documento é convertido de forma efêmera em pasta temporária isolada e apagado imediatamente após gerar o arquivo final, sem retenção ou histórico.`
    : tool.model
      ? `Sim. Em ${tool.title.pt}, o modelo de IA é baixado uma única vez para o cache do seu navegador e toda a inferência roda localmente via WebGPU/WebAssembly no seu dispositivo, sem enviar seus arquivos para a nuvem.`
      : `Sim. ${tool.title.pt} roda 100% localmente no seu navegador via WebAssembly e Web Workers — seus arquivos nunca saem do seu computador ou celular.`;
  const faqs = [
    [
      `Como usar ${tool.title.pt} online gratuitamente?`,
      `Basta abrir ${tool.title.pt} no TinyLab, selecionar ou colar (Ctrl+V) seu conteúdo, ajustar as opções desejadas e baixar o resultado na hora — sem anúncios, sem filas e sem cadastro obrigatório.`,
    ],
    [`Meus arquivos ficam privados em ${tool.title.pt}?`, privacyAnswer],
    [
      `${tool.title.pt} funciona no celular e sem internet?`,
      `Sim. O TinyLab é um aplicativo web progressivo (PWA) compatível com Android, iPhone, Windows, macOS e Linux, podendo ser instalado e preparado para uso offline.`,
    ],
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: `${tool.title.pt} — TinyLab`,
        alternateName: tool.title.en,
        url: canonical,
        image: `${SITE_BASE}/og-banner.jpg`,
        description: tool.description.pt,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "All",
        isAccessibleForFree: true,
        inLanguage: ["pt-BR", "en"],
        offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
        author: {
          "@type": "Organization",
          name: "4u-Labs",
          url: "https://4u.ia.br/",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "TinyLab",
            item: `${SITE_BASE}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: tool.title.pt,
            item: canonical,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  const siblings = internalTools
    .filter((t) => t.category === tool.category && t.id !== tool.id)
    .slice(0, 8);
  const seoSheet = `      <section class="seo-tool-sheet" id="seoToolSheet">
        <span class="eyebrow">${escHtml(catPt)} · TINYLAB</span>
        <h2>${escHtml(tool.title.pt)} (${escHtml(tool.title.en)})</h2>
        <p>${escHtml(tool.description.pt)} — ${escHtml(tool.description.en)}</p>
        <div class="seo-faq">
          ${faqs.map(([q, a]) => `<details><summary>${escHtml(q)}</summary><p>${escHtml(a)}</p></details>`).join("\n          ")}
        </div>
        <nav class="seo-related" aria-label="Ferramentas relacionadas">
          <span>Relacionadas:</span>
          ${siblings.map((rel) => `<a href="../${rel.id}/" data-tool="${rel.id}">${escHtml(rel.title.pt)}</a>`).join("")}
          <a href="../">Todas as ${tools.length} ferramentas →</a>
        </nav>
      </section>\n`;
  const toolHtml = rootHtml
    .replace(
      '<html lang="pt-BR">',
      `<html lang="pt-BR" data-tool-page="${tool.id}">`,
    )
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(pageTitle)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/,
      `<meta name="description" content="${escHtml(metaDesc)}" />`,
    )
    .replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${canonical}" />`,
    )
    .replace(
      /<meta\s+property="og:title"[\s\S]*?\/>/,
      `<meta property="og:title" content="${escHtml(pageTitle)}" />`,
    )
    .replace(
      /<meta\s+property="og:description"[\s\S]*?\/>/,
      `<meta property="og:description" content="${escHtml(tool.description.pt)}" />`,
    )
    .replace(
      /<meta property="og:url" content="[^"]*" \/>/,
      `<meta property="og:url" content="${canonical}" />`,
    )
    .replace(
      /<meta\s+name="twitter:title"[\s\S]*?\/>/,
      `<meta name="twitter:title" content="${escHtml(pageTitle)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"[\s\S]*?\/>/,
      `<meta name="twitter:description" content="${escHtml(tool.description.pt)}" />`,
    )
    .replace(
      /<script type="application\/ld\+json" id="schemaJson">[\s\S]*?<\/script>/,
      `<script type="application/ld+json" id="schemaJson">${JSON.stringify(jsonLd).replaceAll("</", "<\\/")}</script>`,
    )
    .replaceAll('href="favicon-32x32.png', 'href="../favicon-32x32.png')
    .replaceAll('href="icon-96.png', 'href="../icon-96.png')
    .replaceAll('href="favicon.ico', 'href="../favicon.ico')
    .replaceAll('href="icon-192.png', 'href="../icon-192.png')
    .replaceAll('href="manifest.json', 'href="../manifest.json')
    .replaceAll('href="style.css', 'href="../style.css')
    .replaceAll('src="assets/main.js', 'src="../assets/main.js')
    .replaceAll('href="./"', 'href="../"')
    .replaceAll('src="icon-96.png', 'src="../icon-96.png')
    .replaceAll('src="icon-192.png', 'src="../icon-192.png')
    .replace(
      '      <section class="privacy-note">',
      `${seoSheet}      <section class="privacy-note">`,
    );
  await mkdir(tool.id, { recursive: true });
  await writeFile(path.join(tool.id, "index.html"), toolHtml);
}

const today = new Date().toISOString().slice(0, 10);
const sitemapUrls = [
  `  <url>\n    <loc>${SITE_BASE}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
  ...internalTools.map(
    (t) =>
      `  <url>\n    <loc>${SITE_BASE}/${t.id}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
  ),
];
await writeFile(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.join("\n")}\n</urlset>\n`,
);

// Keep .gitignore synced with generated per-tool SEO directories
const gitignoreRaw = await readFile(".gitignore", "utf8");
const markerStart = "# BEGIN GENERATED SEO PAGES";
const markerEnd = "# END GENERATED SEO PAGES";
const generatedIgnoreBlock = `${markerStart}\n${internalTools.map((t) => `/${t.id}/`).join("\n")}\n${markerEnd}\n`;
const cleanedGitignore = gitignoreRaw
  .replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\n?`, "g"), "")
  .trimEnd();
await writeFile(".gitignore", `${cleanedGitignore}\n\n${generatedIgnoreBlock}`);

await writeFile(
  "build-meta.json",
  JSON.stringify(
    {
      version: pkg.version,
      tools: tools.length,
      seoPages: internalTools.length,
      cache,
      files: outputs.length,
    },
    null,
    2,
  ),
);
console.log(
  `TinyLab ${pkg.version}: ${tools.length} tools (${internalTools.length} SEO pages), ${outputs.length} bundles. Cache ${cache}.`,
);
