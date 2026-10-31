import { tools, categories, findTool, searchTools } from "./catalog.js";
import {
  humanBytes,
  validFiles,
  zipOutputs,
  toBlob,
  canvas,
  baseName,
} from "./utils.js";
const $ = (s) => document.querySelector(s);
const APP_ROOT = new URL("../", import.meta.url);
const toolHref = (tool) =>
  tool.external || new URL(`${tool.id}/`, APP_ROOT).pathname;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const stored = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem("tinylab_" + k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem("tinylab_" + k, JSON.stringify(v));
  } catch {}
};
let lang = stored("lang", "pt");
if (!["pt", "en"].includes(lang)) lang = "pt";
const L = (p, e) => (lang === "pt" ? p : e);
let favorites = stored("favorites", []),
  recent = stored("recent", []),
  layout = stored("layout", "grouped"),
  category = "all",
  filter = "all",
  query = "",
  installPrompt = null,
  heroFiles = [];
if (!["grouped", "grid", "compact"].includes(layout)) layout = "grouped";
let active = null,
  files = [],
  results = [],
  urls = [],
  inputUrls = [],
  controller = null,
  previewGeneration = 0,
  pageOrder = null,
  crop = null,
  overlay = null,
  pageOverlays = new Map(),
  sigStamps = new Map(),
  uploadedSigImg = null,
  stampRedraw = null,
  formFields = {},
  lastFocus = null,
  recorder = null,
  recordStream = null,
  recordChunks = [],
  elapsedTimer = null,
  redactMap = new Map(),
  inpaintMaskCanvas = null,
  qrLogoFile = null,
  scannerStream = null,
  scannerTimer = null,
  waveAudioCtx = null,
  waveRaf = null;
const dialog = $("#workspace");
const icons = {
  pdf: "▤",
  image: "◈",
  media: "▷",
  data: "▦",
  text: "Aa",
  dev: "⌘",
  ai: "✧",
};
const specificIcons = {
  "merge-pdf": "⊞",
  "split-pdf": "✂",
  "split-all-pdf": "⫽",
  "organize-pdf": "⇄",
  "delete-pages": "⌫",
  "rotate-pdf": "↻",
  "watermark-pdf": "◈",
  "number-pdf": "№",
  "images-to-pdf": "▤",
  "pdf-to-images": "▣",
  "pdf-to-text": "¶",
  "pdf-extract-images": "🖼",
  "compress-pdf": "⤡",
  "annotate-pdf": "✎",
  "sign-pdf": "✒",
  "fill-pdf": "☑",
  "protect-pdf": "🔒",
  "unlock-pdf": "🔓",
  "ocr-pdf": "⌖",
  "pdf-to-word": "W",
  "word-to-pdf": "⇢",
  "office-to-pdf": "⧉",
  "text-to-pdf": "T",
  "crop-pdf": "◰",
  "pdf-to-excel": "X",
  "flatten-pdf": "▭",
  "redact-pdf": "■",
  "nup-pdf": "⊟",
  "markdown-to-pdf": "M↓",
  "pdf-metadata": "ℹ",
  "pdf-to-pptx": "P",
  "edit-pdf-text": "✍",
  "grayscale-pdf": "◐",
  "compare-pdf": "⇆",
  "epub-pdf": "📖",
  "compress-image": "⤡",
  "convert-image": "⇄",
  "resize-image": "⤢",
  "crop-image": "◰",
  "rotate-image": "↻",
  "flip-image": "⇋",
  "remove-bg": "◌",
  "image-text": "T",
  "watermark-image": "©",
  "border-image": "▣",
  "round-image": "●",
  "collage-image": "⊞",
  "adjust-image": "◐",
  "pixelate-image": "▦",
  "blur-image": "◎",
  "upscale-image": "⤢",
  "heic-to-jpg": "📱",
  "svg-to-png": "◇",
  "favicon-maker": "★",
  "image-metadata": "ℹ",
  "strip-metadata": "🛡",
  "blur-bg": "◎",
  "remove-object": "⌫",
  "image-to-svg": "✦",
  "split-image": "⊟",
  "pfp-maker": "☺",
  "meme-mockup": "😂",
  "pro-image-converter": "PSD",
  "image-palette": "🎨",
  "colorize-image": "🌈",
  "sticker-maker": "🏷",
  "screen-recorder": "◉",
  "extract-audio": "♪",
  "convert-video": "⇄",
  "compress-video": "⤡",
  "trim-video": "✂",
  "resize-video": "⤢",
  "mute-video": "🔇",
  "video-to-gif": "GIF",
  "gif-to-video": "▶",
  "video-frames": "▣",
  "convert-audio": "♫",
  "trim-audio": "✂",
  "merge-audio": "⊞",
  "normalize-audio": "≈",
  "subtitles-video": "CC",
  "burn-subtitles": "🔥",
  "merge-video": "⊞",
  "crop-video": "▯",
  "speed-media": "⏩",
  "voice-recorder": "🎙",
  "text-to-speech": "🔊",
  "add-audio-video": "🎵",
  "reverse-video": "⏪",
  "denoise-audio": "🎧",
  "clipcut-studio": "🎬",
  "baixou-downloader": "⬇",
  "csv-to-excel": "⊞",
  "excel-to-csv": "⇄",
  "csv-to-json": "{ }",
  "json-to-csv": "CSV",
  "json-to-excel": "X",
  "xml-to-json": "⟨⟩",
  "json-to-xml": "⟨/⟩",
  "xml-to-excel": "X",
  "excel-to-json": "{ }",
  "excel-to-xml": "⟨⟩",
  "split-csv": "⫽",
  "split-excel": "⫽",
  "excel-to-pdf": "▤",
  "create-zip": "🗜",
  "extract-zip": "📂",
  "word-counter": "№",
  "clean-text": "✧",
  "case-text": "Aa",
  "dedupe-text": "≠",
  "sort-text": "⇅",
  "compare-text": "⇆",
  "markdown-preview": "M↓",
  "text-replace": "⌕",
  "qr-code-studio": "▦",
  "qr-scanner": "📷",
  "barcode-generator": "|||",
  "jwt-decoder": "JWT",
  "regex-tester": ".*",
  "password-generator": "🔑",
  "hash-crypto": "#",
  "file-hash": "#",
  "json-formatter": "{ }",
  "base64": "64",
  "url-codec": "%",
  timestamp: "🕒",
  uuid: "ID",
  "lorem-ipsum": "¶",
  "color-converter": "🎨",
  "ocr-image": "⌖",
  "ai-remove-bg": "✦",
  transcribe: "🎙",
  summarize: "≡",
  translate: "🌐",
  proofread: "✓",
  rewrite: "✎",
  "ai-caption": "📣",
  "summarize-pdf": "📑",
  "ai-upscale": "⤢",
  "ai-email": "✉",
  "ai-article": "📝",
  "ai-product": "🛍",
  "ai-youtube": "▶",
  "ai-faq": "❓",
  "ai-resume": "📄",
  "ai-brand": "💡",
  "ai-legal": "⚖",
  "ai-transcript-summary": "🗒",
  "ai-code": "⟨/⟩",
};
const toolIcon = (tool) =>
  specificIcons[tool?.id] || icons[tool?.category] || "✦";
const newToolIds = new Set([
  "pdf-to-pptx",
  "edit-pdf-text",
  "grayscale-pdf",
  "compare-pdf",
  "epub-pdf",
  "pro-image-converter",
  "image-palette",
  "colorize-image",
  "sticker-maker",
  "text-to-speech",
  "add-audio-video",
  "reverse-video",
  "denoise-audio",
  "ai-resume",
  "ai-brand",
  "ai-legal",
  "ai-transcript-summary",
  "ai-code",
]);
const popularToolIds = new Set([
  "merge-pdf",
  "compress-pdf",
  "pdf-to-word",
  "sign-pdf",
  "remove-bg",
  "ai-remove-bg",
  "qr-code-studio",
  "burn-subtitles",
  "transcribe",
  "compress-image",
]);
const featuredToolIds = [
  "ai-remove-bg",
  "merge-pdf",
  "pdf-to-word",
  "pdf-to-pptx",
  "pro-image-converter",
  "qr-code-studio",
  "burn-subtitles",
  "transcribe",
];
function toolBadge(tool) {
  if (newToolIds.has(tool.id))
    return `<span class="card-tag tag-new">${L("NOVO", "NEW")}</span>`;
  if (popularToolIds.has(tool.id))
    return `<span class="card-tag tag-hot">${L("Popular", "Popular")}</span>`;
  if (tool.model)
    return `<span class="card-tag tag-ai">${L("IA Local", "Local AI")}</span>`;
  return "";
}
const messages = {
  explore: ["EXPLORE O LAB", "EXPLORE THE LAB"],
  artCaption: ["MENOS ETAPAS. MAIS CRIAÇÃO.", "LESS FRICTION. MORE CREATION."],
  popularLabel: ["Populares:", "Popular:"],
  quickPdf: ["Juntar PDF", "Merge PDF"],
  quickCompress: ["Comprimir imagem", "Compress image"],
  quickCutout: ["Remover Fundo IA", "AI Cutout"],
  quickTts: ["Texto → Voz", "Text → Speech"],
  smartBadge: ["⚡ DETECÇÃO INTELIGENTE", "⚡ SMART DETECTION"],
  smartDropTitle: [
    "Arraste qualquer arquivo aqui",
    "Drop any file here",
  ],
  smartDropSub: [
    "Solte um PDF, foto, PSD/TIFF, vídeo, áudio, planilha ou EPUB (ou pressione Ctrl+V) — sugerimos as ferramentas certas na hora.",
    "Drop a PDF, photo, PSD/TIFF, video, audio, spreadsheet or EPUB (or press Ctrl+V) — we suggest the right tools instantly.",
  ],
  smartDropBtn: [
    "＋ Escolher arquivo do dispositivo",
    "＋ Choose file from device",
  ],
  featuredEyebrow: ["DESTAQUES DO LABORATÓRIO", "LAB HIGHLIGHTS"],
  featuredTitle: ["Ferramentas mais usadas", "Most popular tools"],
  layoutGrouped: ["▤ Por categoria", "▤ By category"],
  layoutGrid: ["▦ Grade", "▦ Grid"],
  layoutCompact: ["☰ Compacto", "☰ Compact"],
  terms: ["Termos", "Terms"],
  privacyLink: ["Privacidade", "Privacy"],
  title: ["Seu laboratório.", "Your laboratory."],
  titleAccent: ["Infinitas possibilidades.", "Endless possibilities."],
  subtitle: [
    "PDFs, imagens, vídeos, arquivos e texto. Ferramentas úteis, sem anúncios e com processamento no seu dispositivo.",
    "PDFs, images, videos, files and text. Useful tools, no ads, processed on your device.",
  ],
  search: [
    "O que você quer fazer? Ex.: juntar PDF, remover fundo, PSD, PIX…",
    "What would you like to do? E.g. merge PDF, remove BG, PSD, QR…",
  ],
  all: ["Todas as ferramentas", "All tools"],
  favorites: ["Favoritas", "Favorites"],
  recent: ["Recentes", "Recent"],
  privacy: ["Seus arquivos ficam com você", "Your files stay with you"],
  privacyText: [
    "Operações no navegador não enviam arquivos. IA baixa modelos; o modo Office local usa somente este computador.",
    "Browser operations do not upload files. AI downloads models; local Office mode uses only this computer.",
  ],
  install: ["Instalar", "Install"],
  offline: ["Preparar offline", "Prepare offline"],
  ecosystem: ["4u-Labs", "4u-Labs"],
  open: ["Abrir ferramenta", "Open tool"],
  close: ["Fechar", "Close"],
  run: ["Processar", "Process"],
  cancel: ["Cancelar", "Cancel"],
  download: ["Baixar", "Download"],
  downloadAll: ["Baixar tudo em ZIP", "Download all as ZIP"],
  copy: ["Copiar", "Copy"],
  input: ["Entrada", "Input"],
  output: ["Resultado", "Result"],
  drop: [
    "Arraste arquivos ou clique para escolher",
    "Drop files or click to choose",
  ],
  dropSub: [
    "Até 512 MB por lote · arquivos permanecem no dispositivo",
    "Up to 512 MB per batch · files remain on your device",
  ],
  empty: [
    "Nenhuma ferramenta encontrada. Tente outra palavra.",
    "No tools found. Try another word.",
  ],
  noResult: ["Seu resultado aparece aqui", "Your result appears here"],
  noResultSub: [
    "Escolha um arquivo ou preencha os campos para começar.",
    "Choose a file or fill in the fields to get started.",
  ],
  ready: ["Pronto para começar", "Ready to start"],
  working: ["Processando no seu dispositivo…", "Processing on your device…"],
  done: [
    "Concluído. Confira a prévia antes de baixar.",
    "Done. Check the preview before downloading.",
  ],
  cancelled: ["Operação cancelada.", "Operation cancelled."],
  help: ["Como usar", "How to use"],
  chain: ["Continuar em outra ferramenta", "Continue in another tool"],
  online: ["Online", "Online"],
  offlineStatus: ["Offline", "Offline"],
  countLabel: ["ferramentas", "tools"],
  categoriesLabel: ["categorias", "categories"],
  localLabel: [
    "sem upload nas operações do navegador",
    "no uploads in browser operations",
  ],
  reset: ["Limpar", "Clear"],
  support: ["Apoiar o projeto", "Support the project"],
  aboutTitle: [
    "Aplicativos, suporte e comunidade",
    "Apps, support and community",
  ],
  aboutText: [
    "TinyLab é o laboratório de utilitários da 4u-Labs. Ferramentas locais, acesso direto e recursos explicados com transparência.",
    "TinyLab is the 4u-Labs utility laboratory. Local tools, direct access and clearly explained capabilities.",
  ],
  footer: ["Feito para facilitar o seu dia.", "Made to simplify your day."],
  resultFiles: ["arquivos gerados", "files generated"],
  clearRecent: ["Limpar recentes", "Clear recents"],
  account: ["Conta 4u-Labs", "4u-Labs account"],
};
const t = (k) => messages[k]?.[lang === "pt" ? 0 : 1] || k;
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}
function status(text, type = "") {
  const el = $("#status");
  if (!el) return;
  el.textContent = text;
  el.dataset.state = type;
}
function cleanResults() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  results = [];
  const el = $("#results");
  if (el)
    el.innerHTML = `<div class="empty-result"><span>✦</span><h3>${t("noResult")}</h3><p>${t("noResultSub")}</p></div>`;
  $("#resultActions")?.replaceChildren();
}
function url(blob, input = false) {
  const u = URL.createObjectURL(blob);
  (input ? inputUrls : urls).push(u);
  return u;
}
function cleanInputUrls() {
  for (const u of inputUrls) URL.revokeObjectURL(u);
  inputUrls = [];
}
function download(result) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(result.blob);
  a.download = result.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
function updateDocTitle() {
  document.title = active
    ? L(
        `${active.title.pt} Online Grátis — Sem Anúncios | TinyLab`,
        `${active.title.en} Free Online — No Ads | TinyLab`,
      )
    : L(
        "TinyLab — 150 Ferramentas Web Livres, Rápidas & Privadas",
        "TinyLab — 150 Free, Fast & Private Web Tools",
      );
}
function translate() {
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  updateDocTitle();
  document
    .querySelectorAll("a.brand")
    .forEach((a) => (a.href = APP_ROOT.pathname));
  document
    .querySelectorAll("[data-t]")
    .forEach((el) => (el.textContent = t(el.dataset.t)));
  $("#search").placeholder = t("search");
  $("#langPt").setAttribute("aria-pressed", String(lang === "pt"));
  $("#langEn").setAttribute("aria-pressed", String(lang === "en"));
  $("#toolCount").textContent = tools.length;
  $("#categoryCount").textContent = categories.length - 1;
  $("#offlineButton").title = L(
    "Baixa as dependências locais para uso offline (mais de 100 MB).",
    "Downloads local dependencies for offline use (over 100 MB).",
  );
  $("#year").textContent = new Date().getFullYear();
  $("#search").setAttribute(
    "aria-label",
    L("Buscar ferramentas", "Search tools"),
  );
  $("#categoryNav").innerHTML = categories
    .map(
      (c) =>
        `<button class="category ${category === c.id ? "selected" : ""}" data-category="${c.id}" aria-pressed="${category === c.id}"><span>${c.icon}</span>${esc(c.label[lang])}<small>${c.id === "all" ? tools.length : tools.filter((t) => t.category === c.id).length}</small></button>`,
    )
    .join("");
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.textContent = t(b.dataset.filter);
    b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  });
  document.querySelectorAll("[data-layout]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.layout === layout));
  });
  renderCatalog();
  if (heroFiles.length) renderHeroDropMatched();
  updateNetwork();
}
function renderFeatured() {
  const sec = $("#featuredSection");
  const grid = $("#featuredGrid");
  if (!sec || !grid) return;
  const show = category === "all" && filter === "all" && !query.trim();
  sec.hidden = !show;
  if (!show) return;
  const items = featuredToolIds.map((id) => findTool(id)).filter(Boolean);
  grid.innerHTML = items
    .map(
      (tool) =>
        `<article class="featured-card ${tool.category}"><a class="featured-link" href="${esc(toolHref(tool))}" data-tool="${tool.id}"><span class="tool-icon">${toolIcon(tool)}</span><div class="featured-body"><div class="featured-top"><strong>${esc(tool.title[lang])}</strong>${toolBadge(tool)}</div><p>${esc(tool.description[lang])}</p></div><span class="featured-arrow" aria-hidden="true">↗</span></a></article>`,
    )
    .join("");
}
function cardHtml(tool) {
  const catLabel =
    categories.find((c) => c.id === tool.category)?.label[lang] || "";
  const isFav = favorites.includes(tool.id);
  const runBadge = tool.external
    ? L("App 4u-Labs ↗", "4u-Labs App ↗")
    : tool.companion
      ? L("Serviço efêmero", "Ephemeral service")
      : tool.model
        ? L("Modelo local", "Local model")
        : L("No navegador", "In browser");
  return `<article class="tool-card ${tool.category}"><div class="card-top"><span class="tool-icon">${toolIcon(tool)}</span><div class="card-top-right">${toolBadge(tool)}<button class="favorite ${isFav ? "saved" : ""}" data-favorite="${tool.id}" aria-label="${L("Favoritar", "Favorite")} ${esc(tool.title[lang])}" aria-pressed="${isFav}">${isFav ? "★" : "☆"}</button></div></div><span class="card-category">${esc(catLabel)}</span><h3><a href="${esc(toolHref(tool))}" data-tool="${tool.id}" ${tool.external ? 'target="_blank" rel="noopener noreferrer"' : ""}>${esc(tool.title[lang])}</a></h3><p>${esc(tool.description[lang])}</p><div class="card-bottom"><span class="local-badge">${runBadge}</span><a class="card-open" href="${esc(toolHref(tool))}" data-tool="${tool.id}" ${tool.external ? 'target="_blank" rel="noopener noreferrer"' : ""} tabindex="-1" aria-hidden="true">↗</a></div></article>`;
}
function renderCatalog() {
  if ($("#searchClear")) $("#searchClear").hidden = !query.length;
  renderFeatured();
  let list = searchTools(query, category, lang);
  if (filter === "favorites")
    list = list.filter((x) => favorites.includes(x.id));
  if (filter === "recent")
    list = recent.map((id) => list.find((t) => t.id === id)).filter(Boolean);
  $("#shownCount").textContent = `${list.length} ${t("countLabel")}`;
  $("#clearRecent").hidden = filter !== "recent" || !recent.length;
  const catEl = $("#catalog");
  const canGroup =
    layout === "grouped" &&
    category === "all" &&
    filter === "all" &&
    !query.trim();
  catEl.className = canGroup
    ? "tools-catalog is-grouped"
    : `tools-grid ${layout === "compact" ? "is-compact" : ""}`.trim();
  if (!list.length) {
    catEl.innerHTML = `<p class="catalog-empty">${t("empty")}</p>`;
    return;
  }
  if (canGroup) {
    catEl.innerHTML = categories
      .filter((c) => c.id !== "all")
      .map((c) => {
        const catTools = list.filter((t) => t.category === c.id);
        if (!catTools.length) return "";
        return `<section class="catalog-section ${c.id}" data-cat-section="${c.id}"><div class="catalog-section-head"><div class="catalog-section-title"><span class="cat-badge ${c.id}">${c.icon}</span><h3>${esc(c.label[lang])}</h3><span class="cat-count">${catTools.length}</span></div><button type="button" class="section-more" data-category="${c.id}">${L(`Filtrar categoria (${catTools.length}) →`, `Filter category (${catTools.length}) →`)}</button></div><div class="tools-grid">${catTools.map(cardHtml).join("")}</div></section>`;
      })
      .join("");
    return;
  }
  catEl.innerHTML = list.map(cardHtml).join("");
}
function recommendToolsForFiles(incoming) {
  const first = incoming[0];
  if (!first) return [];
  const name = (first.name || "").toLowerCase();
  const type = (first.type || "").toLowerCase();
  const isPdf = type === "application/pdf" || name.endsWith(".pdf");
  let ids;
  if (isPdf) {
    ids =
      incoming.length > 1
        ? ["merge-pdf", "compare-pdf", "compress-pdf", "pdf-to-word", "pdf-to-pptx", "edit-pdf-text", "sign-pdf", "split-pdf"]
        : ["compress-pdf", "pdf-to-word", "pdf-to-pptx", "edit-pdf-text", "sign-pdf", "split-pdf", "grayscale-pdf", "summarize-pdf"];
  } else if (name.endsWith(".epub") || type.includes("epub")) {
    ids = ["epub-pdf", "file-hash", "create-zip"];
  } else if (/\.(psd|tiff?|bmp|ico|cur)$/.test(name)) {
    ids = ["pro-image-converter", "image-palette", "compress-image", "resize-image", "convert-image", "watermark-image"];
  } else if (/\.(heic|heif)$/.test(name)) {
    ids = ["heic-to-jpg", "compress-image", "resize-image", "images-to-pdf"];
  } else if (name.endsWith(".svg") || type === "image/svg+xml") {
    ids = ["svg-to-png", "file-hash", "create-zip"];
  } else if (name.endsWith(".gif") || type === "image/gif") {
    ids = ["gif-to-video", "compress-image", "convert-image", "resize-image"];
  } else if (type.startsWith("image/") || /\.(png|jpe?g|webp|avif)$/.test(name)) {
    ids = ["ai-remove-bg", "remove-bg", "compress-image", "resize-image", "image-palette", "sticker-maker", "colorize-image", "ocr-image"];
  } else if (type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/.test(name)) {
    ids = ["trim-video", "compress-video", "burn-subtitles", "add-audio-video", "video-to-gif", "extract-audio", "reverse-video", "transcribe"];
  } else if (type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac)$/.test(name)) {
    ids = ["trim-audio", "denoise-audio", "transcribe", "convert-audio", "normalize-audio", "merge-audio"];
  } else if (/\.(docx?|odt)$/.test(name)) {
    ids = ["word-to-pdf", "office-to-pdf", "file-hash"];
  } else if (/\.(xlsx?|ods)$/.test(name)) {
    ids = ["excel-to-pdf", "excel-to-csv", "excel-to-json", "split-excel", "excel-to-xml"];
  } else if (/\.(pptx?|odp)$/.test(name)) {
    ids = ["office-to-pdf", "file-hash"];
  } else if (name.endsWith(".csv") || type === "text/csv") {
    ids = ["csv-to-excel", "csv-to-json", "split-csv", "excel-to-pdf"];
  } else if (name.endsWith(".json") || type.includes("json")) {
    ids = ["json-to-excel", "json-to-csv", "json-to-xml", "file-hash"];
  } else if (name.endsWith(".xml") || type.includes("xml")) {
    ids = ["xml-to-json", "xml-to-excel", "file-hash"];
  } else if (name.endsWith(".zip") || type.includes("zip")) {
    ids = ["extract-zip", "file-hash"];
  } else {
    ids = ["file-hash", "create-zip"];
  }
  // Only keep internal tools that really accept this file (guards against catalog drift).
  return ids
    .map((id) => findTool(id))
    .filter((tool) => {
      if (!tool || tool.external || tool.input !== "files") return false;
      try {
        validFiles(tool, [first]);
        return true;
      } catch {
        return false;
      }
    });
}
function filesForTool(tool, incoming) {
  return tool?.multiple ? [...incoming] : incoming.slice(0, 1);
}
function renderHeroDropMatched() {
  const box = $("#heroDropMatched");
  if (!box) return;
  if (!heroFiles.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const recs = recommendToolsForFiles(heroFiles);
  const totalBytes = heroFiles.reduce((s, f) => s + (f.size || 0), 0);
  const first = heroFiles[0];
  const label =
    heroFiles.length > 1
      ? `${first.name} +${heroFiles.length - 1}`
      : first.name;
  box.hidden = false;
  box.innerHTML = `<div class="matched-head"><div class="matched-file"><span aria-hidden="true">📄</span><strong>${esc(label)}</strong><small>${humanBytes(totalBytes)}</small></div><button type="button" class="matched-close" id="heroDropClear" aria-label="${t("close")}">×</button></div>${
    recs.length
      ? `<p class="matched-sub">${L("Ferramentas compatíveis com seu arquivo — clique para abrir já carregado:", "Compatible tools for your file — click to open preloaded:")}</p><div class="matched-grid">${recs.map((tool) => `<button type="button" class="matched-tool ${tool.category}" data-hero-open="${tool.id}"><span class="tool-icon" aria-hidden="true">${toolIcon(tool)}</span><span>${esc(tool.title[lang])}</span></button>`).join("")}</div>`
      : `<p class="matched-sub">${L("Nenhuma ferramenta compatível com este arquivo (vazio ou formato não suportado).", "No compatible tool for this file (empty or unsupported format).")}</p>`
  }`;
}
function setHeroFiles(incoming) {
  heroFiles = incoming.filter((f) => f && f.size);
  renderHeroDropMatched();
  if (heroFiles.length)
    $("#heroDropMatched")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function field(o) {
  const id = "option-" + o.key,
    base = `id="${id}" name="${o.key}"`;
  let control;
  if (o.type === "textarea")
    control = `<textarea ${base} rows="${o.key === "content" ? 6 : 4}" spellcheck="false">${esc(o.value)}</textarea>`;
  else if (o.type === "select")
    control = `<select ${base}>${o.items.map((i) => `<option value="${esc(i.value)}" ${i.value === o.value ? "selected" : ""}>${esc(i.label[lang])}</option>`).join("")}</select>`;
  else
    control = `<input ${base} type="${o.type}" value="${esc(o.value)}" ${o.min !== undefined ? `min="${o.min}" max="${o.max}" step="any"` : ""} ${o.type === "password" ? 'autocomplete="new-password"' : ""}>`;
  return `<label class="control ${o.type === "textarea" ? "wide" : ""}" for="${id}"><span>${esc(o.label[lang])}</span>${control}</label>`;
}
function helpText(tool) {
  const basic =
    tool.input === "files"
      ? L(
          "1. Selecione ou cole (Ctrl+V) os arquivos. 2. Ajuste as opções e confira a prévia. 3. Processe e baixe o resultado.",
          "1. Select or paste (Ctrl+V) your files. 2. Adjust options and check the preview. 3. Process and download.",
        )
      : L(
          "Preencha os campos, processe e copie ou baixe o resultado.",
          "Fill in the fields, process, then copy or download the result.",
        );
  const special = {
    "sign-pdf": L(
      "Assinatura visual (desenhada, cursiva digitada ou imagem enviada) aplicada em camada transparente sem rasterizar o texto original do PDF.",
      "Visual signature (drawn, typed cursive or uploaded image) stamped as a transparent layer without rasterizing original PDF text.",
    ),
    "annotate-pdf": L(
      "Desenhe, destaque ou insira texto em uma ou mais páginas. As anotações preservam o texto vetorial original.",
      "Draw, highlight or insert text across one or multiple pages while preserving original vector text.",
    ),
    "redact-pdf": L(
      "Arraste caixas sobre áreas confidenciais ou informe palavras-chave. As páginas tarjadas são regravadas sem o texto original e os metadados são limpos.",
      "Drag boxes over confidential areas or enter keywords. Redacted pages are rewritten without underlying text and metadata is wiped.",
    ),
    "crop-image": L(
      "Arraste sobre a imagem para selecionar o recorte.",
      "Drag on the image to select your crop.",
    ),
    "remove-object": L(
      "Pinte diretamente sobre marcas-d’água, datas ou objetos na prévia para reconstituir a área.",
      "Paint directly over watermarks, dates or unwanted objects on the preview to reconstruct the area.",
    ),
    "compress-pdf": L(
      "O modo Inteligente recomprime imagens internas mantendo texto selecionável e links. A rasterização converte páginas inteiras em imagem.",
      "Smart mode recompresses embedded images while keeping selectable text and links. Rasterization converts full pages to images.",
    ),
    "pdf-to-word": L(
      "Reconstrói títulos, parágrafos, negritos, tabelas e imagens em DOCX. Para PDFs digitalizados sem texto, use OCR de PDF primeiro.",
      "Reconstructs headings, paragraphs, bold text, tables and images into DOCX. For scanned PDFs without text, run PDF OCR first.",
    ),
    "word-to-pdf": L(
      "O modo No navegador converte localmente títulos, listas, tabelas e imagens sem enviar o arquivo. O modo LibreOffice usa conversão efêmera sem armazenamento.",
      "In-browser mode locally renders headings, lists, tables and images without uploading. LibreOffice mode uses ephemeral conversion with no storage.",
    ),
    "office-to-pdf": L(
      "Converte documentos, planilhas e apresentações em diretório temporário isolado via LibreOffice e apaga imediatamente após gerar o PDF.",
      "Converts documents, spreadsheets and presentations in an isolated temporary directory via LibreOffice and deletes them immediately.",
    ),
    "remove-bg": L(
      "Ideal para logos, ícones e fundos uniformes. Após processar, você pode refinar qualquer detalhe com o pincel Apagar/Restaurar.",
      "Ideal for logos, icons and solid backgrounds. After processing, refine any detail with the Erase/Restore brush.",
    ),
    "blur-bg": L(
      "Detecta o assunto com IA local e aplica desfoque estilo retrato. Use o pincel de refino abaixo do resultado para ajustar qualquer detalhe.",
      "Detects the subject with local AI and applies portrait bokeh blur. Use the refine brush below the result to tweak any detail.",
    ),
    "video-frames": L(
      "Até 200 quadros por execução para proteger a memória do dispositivo.",
      "Up to 200 frames per run to protect device memory.",
    ),
    "subtitles-video": L(
      "Cria uma faixa de legendas selecionável. Para gravar na imagem do vídeo, use Queimar legendas (SRT).",
      "Creates a selectable subtitle track. To hardcode onto frames, use Burn SRT subtitles.",
    ),
    "burn-subtitles": L(
      "Grava as legendas SRT diretamente nos quadros do vídeo, ideal para Reels, Shorts e TikTok.",
      "Hardcodes SRT subtitles directly onto the video frames, ideal for Reels, Shorts and TikTok.",
    ),
    "screen-recorder": L(
      "O áudio depende do navegador e da origem escolhida. A gravação usa o formato suportado pelo navegador.",
      "Audio depends on the browser and capture source. Recording uses a format supported by your browser.",
    ),
    "voice-recorder": L(
      "Permita o uso do microfone no navegador. O áudio é gravado localmente no seu dispositivo.",
      "Allow microphone access in your browser. Audio is recorded locally on your device.",
    ),
    "qr-scanner": L(
      "Envie ou cole (Ctrl+V) uma imagem com QR Code / Código de Barras, ou use o botão de leitura ao vivo pela câmera.",
      "Upload or paste (Ctrl+V) an image with a QR Code / Barcode, or scan live with your camera.",
    ),
    "upscale-image": L(
      "Ampliação por interpolação. Não recupera detalhes que não existem na imagem original.",
      "Interpolation-based enlargement. Does not recover details missing from the original image.",
    ),
    "pdf-to-pptx": L(
      "Cada página do PDF vira um slide editável no PowerPoint (.pptx).",
      "Each PDF page becomes an editable slide in PowerPoint (.pptx).",
    ),
    "edit-pdf-text": L(
      "Informe o trecho exato para localizar e o novo texto para substituir nas páginas do PDF.",
      "Enter the exact phrase to find and the replacement text across PDF pages.",
    ),
    "compare-pdf": L(
      "Selecione 2 arquivos PDF para comparar linha a linha e gerar o relatório visual de diferenças.",
      "Select 2 PDF files to compare line by line and generate a visual diff report.",
    ),
    "epub-pdf": L(
      "Envie um arquivo .epub para gerar um PDF paginado ou envie um .pdf para exportar um e-book EPUB 3.",
      "Upload an .epub to generate a paginated PDF or upload a .pdf to export an EPUB 3 e-book.",
    ),
    "image-palette": L(
      "Clique em qualquer ponto da imagem na prévia para capturar a cor exata (HEX/RGB) ou clique em Processar para gerar o cartão da paleta.",
      "Click anywhere on the preview image to sample a pixel's exact HEX/RGB color, or click Process to generate the full palette card.",
    ),
    "add-audio-video": L(
      "Selecione 1 arquivo de vídeo (.mp4/.webm) e 1 arquivo de áudio (.mp3/.wav) juntos.",
      "Select 1 video file (.mp4/.webm) and 1 audio file (.mp3/.wav) together.",
    ),
  };
  return basic + " " + (special[tool.id] || "");
}
function modelNotice(tool) {
  if (!tool.model) return "";
  const size =
    tool.id === "ai-upscale"
      ? "~50 MB"
      : tool.id === "ai-remove-bg" || tool.id === "blur-bg"
        ? "~26–42 MB"
        : tool.id === "transcribe"
          ? "~75 MB"
          : "~400 MB / 1.1 GB";
  return `<div class="model-notice"><span>✧</span><p>${L(`Na primeira execução, baixa um modelo (${size}) e usa WebGPU automaticamente quando disponível (ou WASM). A inferência ocorre neste dispositivo.`, `The first run downloads a model (${size}) and automatically uses WebGPU when available (or WASM). Inference runs on this device.`)}</p></div>`;
}
function stopScanner() {
  clearInterval(scannerTimer);
  scannerTimer = null;
  scannerStream?.getTracks().forEach((t) => t.stop());
  scannerStream = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
function openTool(id, { chainFiles = [], content = "", fromPaste = false } = {}) {
  const tool = findTool(id);
  if (!tool) return;
  if (tool.external) {
    recent = [tool.id, ...recent.filter((rid) => rid !== tool.id)].slice(0, 20);
    save("recent", recent);
    renderCatalog();
    window.open(tool.external, "_blank", "noopener,noreferrer");
    return;
  }
  controller?.abort();
  controller = null;
  cleanInputUrls();
  stopRecorder(true);
  stopScanner();
  previewGeneration++;
  lastFocus = document.activeElement;
  active = tool;
  files = [];
  pageOrder = null;
  crop = null;
  overlay = null;
  pageOverlays = new Map();
  sigStamps = new Map();
  redactMap = new Map();
  inpaintMaskCanvas = null;
  qrLogoFile = null;
  uploadedSigImg?.close?.();
  uploadedSigImg = null;
  stampRedraw = null;
  formFields = {};
  cleanResults();
  const targetPath = new URL(`${id}/`, APP_ROOT).pathname;
  if (location.pathname !== targetPath || location.hash)
    history.replaceState(null, "", targetPath + location.search);
  updateDocTitle();
  $("#workspaceIcon").textContent = toolIcon(tool);
  $("#workspaceCategory").textContent = categories.find(
    (c) => c.id === tool.category,
  ).label[lang];
  $("#workspaceTitle").textContent = tool.title[lang];
  $("#workspaceDescription").textContent = tool.description[lang];
  const ecoBar =
    tool.category === "media"
      ? `<div class="ecosystem-shortcuts"><span>${L("Apps irmãos 4u-Labs:", "4u-Labs sister apps:")}</span><a href="https://4u.ia.br/app/clipcut/" target="_blank" rel="noopener noreferrer">✂ ClipCut (${L("Editor Multifaixas", "Multitrack Editor")}) ↗</a><a href="https://4u.ia.br/app/baixou/" target="_blank" rel="noopener noreferrer">⬇ BAIXOU!! (${L("Baixar Vídeos", "Video Downloader")}) ↗</a></div>`
      : tool.category === "image"
        ? `<div class="ecosystem-shortcuts"><span>${L("App irmão 4u-Labs:", "4u-Labs sister app:")}</span><a href="https://4u.ia.br/app/oneclick/" target="_blank" rel="noopener noreferrer">✨ OneClick AI (${L("Estúdio Fotográfico IA", "AI Photo Studio")}) ↗</a></div>`
        : "";
  const pasteQuickTools = fromPaste && chainFiles.length
    ? (() => {
        const recs = recommendToolsForFiles(chainFiles);
        if (!recs.some((r) => r.id === tool.id)) recs.unshift(tool);
        return recs.slice(0, 8).map((r) => [r.id, r.title[lang]]);
      })()
    : [];
  const pasteBar = pasteQuickTools.length
    ? `<div class="paste-switch-bar"><span>⚡ ${L("Arquivo carregado — trocar ação:", "File loaded — switch tool:")}</span><div class="paste-chips">${pasteQuickTools.map(([tid, lbl]) => `<button type="button" class="secondary small ${tid === tool.id ? "is-active" : ""}" data-paste-switch="${tid}">${esc(lbl)}</button>`).join("")}</div></div>`
    : "";
  const extraControls =
    tool.id === "qr-scanner"
      ? `<div class="camera-scanner"><button type="button" class="secondary" id="cameraScanBtn">📷 ${L("Ler com a Câmera ao vivo", "Scan with Live Camera")}</button><div id="cameraStage" class="camera-stage" hidden><video id="cameraVideo" playsinline muted></video></div></div>`
      : tool.id === "burn-subtitles" || tool.id === "subtitles-video"
        ? `<div class="sig-upload-bar"><label class="secondary file-pill">📂 ${L("Importar arquivo .srt", "Import .srt file")}<input id="srtFileInput" type="file" accept=".srt,text/plain" hidden></label></div>`
        : tool.id === "qr-code-studio"
          ? `<div class="sig-upload-bar"><label class="secondary file-pill"><span id="qrLogoText">🖼 ${L("Opcional: Logo central (PNG/JPG)", "Optional: Center logo (PNG/JPG)")}</span><input id="qrLogoInput" type="file" accept="image/*" hidden></label><button type="button" class="secondary small" id="qrLogoClear" hidden>×</button></div>`
          : tool.id === "text-to-speech"
            ? `<div class="sig-upload-bar"><button type="button" class="secondary small" id="ttsSpeakBtn">🔊 ${L("Ouvir com voz do navegador (Web Speech)", "Listen with browser voice (Web Speech)")}</button><button type="button" class="secondary small" id="ttsStopBtn" hidden>⏹ ${L("Parar voz", "Stop voice")}</button></div>`
            : "";
  $("#workspaceBody").innerHTML =
    `<div class="workspace-input">${ecoBar}${pasteBar}<form id="toolForm"><fieldset id="toolFields">${tool.input === "files" ? `<label class="dropzone" id="dropzone" tabindex="0"><input id="fileInput" type="file" accept="${esc(tool.accept)}" ${tool.multiple ? "multiple" : ""} hidden><span class="drop-icon">＋</span><strong>${t("drop")}</strong><small>${t("dropSub")} · Ctrl+V</small></label><ol id="fileList" class="file-list"></ol>` : ""}${tool.input === "record" ? `<div class="record-panel"><span>${tool.id === "voice-recorder" ? "🎙" : "◉"}</span><p>${helpText(tool)}</p><button type="button" class="primary" id="recordToggle">${L("Iniciar gravação", "Start recording")}</button><canvas id="recordWave" class="record-wave" width="480" height="76" hidden></canvas><p id="recordClock">00:00</p></div>` : ""}${extraControls}<div class="controls">${tool.options.map(field).join("")}</div><div id="formFields" class="controls"></div><div id="inputPreview" class="input-preview"></div>${modelNotice(tool)}<details class="help"><summary>${t("help")}</summary><p>${esc(helpText(tool))}</p></details></fieldset><div class="execution-bar">${tool.input !== "record" ? `<button class="primary" type="submit" id="execute">${tool.model ? L("Baixar modelo e processar", "Download model & process") : t("run")} <span>→</span></button>` : ""}<button type="button" class="secondary" id="clearInput">${t("reset")}</button><button type="button" class="secondary danger" id="cancel" hidden>${t("cancel")}</button></div></form><div class="progress-box"><progress id="progress" max="100" value="0" hidden></progress><p id="status" role="status" aria-live="polite">${t("ready")}</p></div></div><div class="workspace-output"><div class="output-heading"><span class="eyebrow">${t("output")}</span><div id="resultActions"></div></div><div id="results"></div></div>`;
  cleanResults();
  $("#workspaceBody")
    .querySelectorAll("[data-paste-switch]")
    .forEach((btn) => {
      btn.onclick = () =>
        openTool(btn.dataset.pasteSwitch, {
          chainFiles: filesForTool(
            findTool(btn.dataset.pasteSwitch),
            chainFiles.length ? chainFiles : files,
          ),
          fromPaste: true,
        });
    });
  if ($("#srtFileInput")) {
    $("#srtFileInput").onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      $("#option-subtitles").value = await f.text();
      cleanResults();
      toast(L("Arquivo .srt carregado!", ".srt file loaded!"));
    };
  }
  if ($("#qrLogoInput")) {
    $("#qrLogoInput").onchange = (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      qrLogoFile = f;
      $("#qrLogoText").textContent = `✓ ${f.name}`;
      $("#qrLogoClear").hidden = false;
      if ($("#option-ecLevel")) $("#option-ecLevel").value = "H";
      cleanResults();
    };
    $("#qrLogoClear").onclick = () => {
      qrLogoFile = null;
      $("#qrLogoInput").value = "";
      $("#qrLogoText").textContent =
        "🖼 " +
        L(
          "Opcional: Logo central (PNG/JPG)",
          "Optional: Center logo (PNG/JPG)",
        );
      $("#qrLogoClear").hidden = true;
      cleanResults();
    };
  }
  if ($("#cameraScanBtn")) {
    $("#cameraScanBtn").onclick = toggleCameraScanner;
  }
  if ($("#ttsSpeakBtn")) {
    $("#ttsSpeakBtn").onclick = () => {
      if (typeof speechSynthesis === "undefined") {
        toast(
          L(
            "Síntese nativa indisponível neste navegador. Clique em Processar para gerar o WAV.",
            "Native speech unavailable in this browser. Click Process to generate WAV.",
          ),
        );
        return;
      }
      speechSynthesis.cancel();
      const txt = ($("#option-content")?.value || "").trim();
      if (!txt) return;
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = lang === "pt" ? "pt-BR" : "en-US";
      u.rate = Number($("#option-rate")?.value || 1);
      const vp = $("#option-voiceProfile")?.value || "female";
      u.pitch =
        vp === "female" ? 1.15 : vp === "male" ? 0.82 : vp === "robot" ? 0.6 : 1.0;
      $("#ttsStopBtn").hidden = false;
      u.onend = u.onerror = () => {
        if ($("#ttsStopBtn")) $("#ttsStopBtn").hidden = true;
      };
      speechSynthesis.speak(u);
    };
    $("#ttsStopBtn").onclick = () => {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      $("#ttsStopBtn").hidden = true;
    };
  }
  $("#toolForm").addEventListener("submit", execute);
  $("#clearInput").onclick = () => {
    controller?.abort();
    cleanInputUrls();
    stopRecorder(true);
    stopScanner();
    files = [];
    previewGeneration++;
    pageOrder = null;
    crop = null;
    overlay = null;
    pageOverlays = new Map();
    sigStamps = new Map();
    redactMap = new Map();
    inpaintMaskCanvas = null;
    qrLogoFile = null;
    if ($("#qrLogoText"))
      $("#qrLogoText").textContent =
        "🖼 " +
        L(
          "Opcional: Logo central (PNG/JPG)",
          "Optional: Center logo (PNG/JPG)",
        );
    if ($("#qrLogoClear")) $("#qrLogoClear").hidden = true;
    if ($("#cameraStage")) $("#cameraStage").hidden = true;
    if ($("#cameraScanBtn"))
      $("#cameraScanBtn").textContent =
        "📷 " + L("Ler com a Câmera ao vivo", "Scan with Live Camera");
    uploadedSigImg?.close?.();
    uploadedSigImg = null;
    stampRedraw = null;
    $("#toolForm").reset();
    $("#inputPreview").replaceChildren();
    $("#formFields").replaceChildren();
    renderFiles();
    cleanResults();
    status(t("ready"));
  };
  $("#cancel").onclick = () => controller?.abort();
  $("#toolForm").addEventListener("input", (e) => {
    if (controller) return;
    cleanResults();
    status(t("ready"));
    if (
      e.target.name === "page" ||
      e.target.name === "signMode" ||
      e.target.name === "redactColor"
    )
      renderInputPreview();
    else if (
      ["sigText", "stampScale", "color"].includes(e.target.name) &&
      stampRedraw
    )
      stampRedraw();
  });
  if (tool.input === "files") {
    const input = $("#fileInput"),
      drop = $("#dropzone");
    input.onchange = () => addFiles([...input.files]);
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    drop.ondragover = (e) => {
      e.preventDefault();
      drop.classList.add("dragover");
    };
    drop.ondragleave = () => drop.classList.remove("dragover");
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove("dragover");
      addFiles([...e.dataTransfer.files]);
    };
  }
  if (tool.input === "record") $("#recordToggle").onclick = toggleRecord;
  if (content && $("#option-content")) $("#option-content").value = content;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  if (chainFiles.length) addFiles(chainFiles);
  $("#workspaceClose").focus();
}
function options() {
  const o = {};
  for (const schema of active.options) {
    const el = document.getElementById("option-" + schema.key);
    o[schema.key] = schema.type === "number" ? Number(el.value) : el.value;
  }
  return { ...o, lang, pageOrder, crop, formFields };
}
function renderFiles() {
  const el = $("#fileList");
  if (!el) return;
  el.innerHTML = files
    .map(
      (f, i) =>
        `<li draggable="true" data-file="${i}"><span class="file-grip" aria-hidden="true">⠿</span><div><strong>${esc(f.name)}</strong><small>${humanBytes(f.size)}</small></div><button type="button" data-move="${i}:-1" aria-label="${L("Mover para cima", "Move up")}">↑</button><button type="button" data-move="${i}:1" aria-label="${L("Mover para baixo", "Move down")}">↓</button><button type="button" data-remove="${i}" aria-label="${L("Remover arquivo", "Remove file")}">×</button></li>`,
    )
    .join("");
  let drag;
  el.querySelectorAll("li").forEach((li) => {
    li.ondragstart = () => (drag = Number(li.dataset.file));
    li.ondragover = (e) => e.preventDefault();
    li.ondrop = (e) => {
      e.preventDefault();
      const to = Number(li.dataset.file);
      if (Number.isInteger(drag) && drag !== to) {
        files.splice(to, 0, files.splice(drag, 1)[0]);
        fileChanged();
      }
    };
  });
  el.onclick = (e) => {
    const remove = e.target.closest("[data-remove]"),
      move = e.target.closest("[data-move]");
    if (remove) {
      files.splice(Number(remove.dataset.remove), 1);
      fileChanged();
    }
    if (move) {
      const [i, delta] = move.dataset.move.split(":").map(Number),
        to = i + delta;
      if (to >= 0 && to < files.length) {
        [files[i], files[to]] = [files[to], files[i]];
        fileChanged();
      }
    }
  };
}
function addFiles(incoming) {
  if (!active.multiple && incoming.length > 1) {
    status(
      L(
        "Esta ferramenta aceita um arquivo por vez.",
        "This tool accepts one file at a time.",
      ),
      "error",
    );
    return;
  }
  const next = active.multiple ? [...files, ...incoming] : incoming.slice(0, 1);
  try {
    validFiles(active, next);
    files = next;
    fileChanged();
  } catch (e) {
    status(e.message, "error");
  }
}
function fileChanged() {
  cleanInputUrls();
  previewGeneration++;
  pageOrder = null;
  crop = null;
  overlay = null;
  pageOverlays = new Map();
  sigStamps = new Map();
  redactMap = new Map();
  inpaintMaskCanvas = null;
  uploadedSigImg?.close?.();
  uploadedSigImg = null;
  stampRedraw = null;
  formFields = {};
  cleanResults();
  renderFiles();
  renderInputPreview();
  status(t("ready"));
}
async function renderInputPreview() {
  const el = $("#inputPreview"),
    generation = ++previewGeneration;
  if (!el) return;
  el.replaceChildren();
  if (!files.length) return;
  const file = files[0];
  try {
    if (active.id === "organize-pdf") {
      const { loadView, renderPage } = await import("./engines/pdf.js");
      const doc = await loadView(file);
      try {
        if (generation !== previewGeneration) return;
        pageOrder = Array.from({ length: doc.numPages }, (_, i) => i);
        el.innerHTML = `<p class="hint">${L("Arraste ou use as setas para organizar. × exclui uma página.", "Drag or use arrows to organize. × removes a page.")}</p><div class="page-grid" id="pageGrid"></div>`;
        const grid = $("#pageGrid");
        function drawOrder() {
          grid.replaceChildren(...pageOrder.map((i) => tiles.get(i)));
        }
        const tiles = new Map();
        let dragging;
        for (let i = 0; i < doc.numPages; i++) {
          if (generation !== previewGeneration) return;
          const tile = document.createElement("div");
          tile.className = "page-tile";
          tile.draggable = true;
          tile.dataset.page = i;
          tile.innerHTML = `<span>${i + 1}</span><div class="page-buttons"><button type="button" data-prev aria-label="${L("Mover antes", "Move earlier")}">←</button><button type="button" data-next aria-label="${L("Mover depois", "Move later")}">→</button><button type="button" data-del aria-label="${L("Excluir página", "Delete page")}">×</button></div>`;
          tile.ondragstart = () => (dragging = i);
          tile.ondragover = (e) => e.preventDefault();
          tile.ondrop = (e) => {
            e.preventDefault();
            const a = pageOrder.indexOf(dragging),
              b = pageOrder.indexOf(i);
            if (a < 0 || b < 0) return;
            pageOrder.splice(b, 0, pageOrder.splice(a, 1)[0]);
            drawOrder();
            cleanResults();
          };
          tile.onclick = (e) => {
            const idx = pageOrder.indexOf(i);
            if (e.target.closest("[data-del]")) pageOrder.splice(idx, 1);
            else if (e.target.closest("[data-prev]") && idx > 0)
              [pageOrder[idx - 1], pageOrder[idx]] = [
                pageOrder[idx],
                pageOrder[idx - 1],
              ];
            else if (
              e.target.closest("[data-next]") &&
              idx < pageOrder.length - 1
            )
              [pageOrder[idx + 1], pageOrder[idx]] = [
                pageOrder[idx],
                pageOrder[idx + 1],
              ];
            drawOrder();
            cleanResults();
          };
          tiles.set(i, tile);
          grid.append(tile);
          if (i < 100) {
            const page = await doc.getPage(i + 1),
              v = page.getViewport({ scale: 1 }),
              c = await renderPage(doc, i, 150 / v.width);
            tile.prepend(c);
          }
        }
      } finally {
        await doc.destroy();
      }
      return;
    }
    if (active.id === "fill-pdf") {
      const { formSchema } = await import("./engines/pdf.js"),
        fields = await formSchema(file);
      if (generation !== previewGeneration) return;
      const target = $("#formFields");
      target.innerHTML = "";
      if (!fields.length) {
        target.innerHTML = `<p>${L("Este PDF não contém campos de formulário. Use Anotar PDF para adicionar texto.", "This PDF has no form fields. Use Annotate PDF to add text.")}</p>`;
        return;
      }
      for (const f of fields) {
        if (Array.isArray(f.value)) f.value = f.value[0] || "";
        formFields[f.name] = f.value;
        const label = document.createElement("label");
        label.className = "control wide";
        const span = document.createElement("span");
        span.textContent = f.name;
        const input = document.createElement(
          f.type === "select" ? "select" : "input",
        );
        if (f.type === "select")
          for (const v of f.options) {
            const op = document.createElement("option");
            op.value = v;
            op.textContent = v;
            input.append(op);
          }
        else input.type = f.type;
        input.value = String(f.value);
        if (f.type === "checkbox") input.checked = Boolean(f.value);
        input.oninput = () => {
          formFields[f.name] =
            input.type === "checkbox" ? input.checked : input.value;
          cleanResults();
        };
        label.append(span, input);
        target.append(label);
      }
      return;
    }
    if (active.id === "sign-pdf" || active.id === "annotate-pdf") {
      stampRedraw = null;
      const { loadView, renderPage } = await import("./engines/pdf.js"),
        doc = await loadView(file);
      try {
        const i = Math.max(0, Number($("#option-page").value) - 1);
        if (i >= doc.numPages)
          throw new Error(L("Página inexistente", "Page does not exist"));
        const page = await doc.getPage(i + 1),
          v = page.getViewport({ scale: 1 }),
          c = await renderPage(doc, i, Math.min(1.5, 900 / v.width));
        if (generation !== previewGeneration) return;
        const nav = document.createElement("div");
        nav.className = "pdf-page-bar";
        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "secondary";
        prevBtn.textContent = "←";
        prevBtn.disabled = i === 0;
        prevBtn.onclick = () => {
          $("#option-page").value = i;
          renderInputPreview();
        };
        const pageInfo = document.createElement("span");
        const updateMarkedLabel = () => {
          const marked = [...pageOverlays.entries()]
            .filter(([, cv]) => canvasHasInk(cv))
            .map(([idx]) => idx + 1);
          for (const idx of sigStamps.keys())
            if (!marked.includes(idx + 1)) marked.push(idx + 1);
          marked.sort((a, b) => a - b);
          pageInfo.textContent =
            L(`Página ${i + 1} de ${doc.numPages}`, `Page ${i + 1} of ${doc.numPages}`) +
            (marked.length
              ? ` · ${L("Marcadas", "Marked")}: ${marked.join(", ")}`
              : "");
        };
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "secondary";
        nextBtn.textContent = "→";
        nextBtn.disabled = i >= doc.numPages - 1;
        nextBtn.onclick = () => {
          $("#option-page").value = i + 2;
          renderInputPreview();
        };
        nav.append(prevBtn, pageInfo, nextBtn);
        el.append(nav);

        const signMode =
          active.id === "sign-pdf"
            ? $("#option-signMode")?.value || "draw"
            : "draw";

        if (active.id === "sign-pdf" && signMode === "upload") {
          const upBar = document.createElement("div");
          upBar.className = "sig-upload-bar";
          const upLabel = document.createElement("label");
          upLabel.className = "secondary file-pill";
          upLabel.textContent = uploadedSigImg
            ? L("Trocar imagem da assinatura", "Change signature image")
            : L("Escolher imagem da assinatura (PNG/JPG)", "Choose signature image (PNG/JPG)");
          const upInput = document.createElement("input");
          upInput.type = "file";
          upInput.accept = "image/*";
          upInput.hidden = true;
          upInput.onchange = async () => {
            if (!upInput.files?.[0]) return;
            try {
              const { bitmap } = await import("./utils.js");
              uploadedSigImg?.close?.();
              uploadedSigImg = await bitmap(upInput.files[0]);
              if (!sigStamps.has(i)) sigStamps.set(i, { x: 0.65, y: 0.82 });
              renderInputPreview();
            } catch (err) {
              status(err.message, "error");
            }
          };
          upLabel.append(upInput);
          upBar.append(upLabel);
          el.append(upBar);
        }

        const stage = document.createElement("div");
        stage.className = "draw-stage";
        stage.append(c);
        let saved = pageOverlays.get(i);
        if (!saved || saved.width !== c.width || saved.height !== c.height) {
          const fresh = canvas(c.width, c.height);
          if (saved)
            fresh.getContext("2d").drawImage(saved, 0, 0, c.width, c.height);
          saved = fresh;
          pageOverlays.set(i, saved);
        }
        overlay = saved;
        overlay.className = "draw-overlay";
        stage.append(overlay);

        if (active.id === "sign-pdf" && signMode !== "draw") {
          overlay.style.pointerEvents = "none";
          const stampLayer = canvas(c.width, c.height);
          stampLayer.className = "draw-overlay stamp-overlay";
          stage.append(stampLayer);
          if (!sigStamps.has(i)) sigStamps.set(i, { x: 0.65, y: 0.82 });
          stampRedraw = () => {
            const sg = stampLayer.getContext("2d");
            sg.clearRect(0, 0, stampLayer.width, stampLayer.height);
            paintSignatureStamp(
              sg,
              stampLayer.width,
              stampLayer.height,
              sigStamps.get(i),
              {
                signMode,
                sigText: $("#option-sigText")?.value || "",
                stampScale: Number($("#option-stampScale")?.value || 32),
                color: $("#option-color")?.value || "#7928ca",
                sigImg: uploadedSigImg,
                guide: true,
              },
            );
            updateMarkedLabel();
          };
          setupStampDrag(stampLayer, i, stampRedraw);
          stampRedraw();
        } else {
          overlay.style.pointerEvents = "auto";
          setupDrawing(overlay, updateMarkedLabel);
        }

        updateMarkedLabel();
        el.append(stage);
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "secondary";
        clear.textContent = L("Limpar marcação desta página", "Clear this page");
        clear.onclick = () => {
          overlay
            .getContext("2d")
            .clearRect(0, 0, overlay.width, overlay.height);
          sigStamps.delete(i);
          if (stampRedraw) stampRedraw();
          updateMarkedLabel();
          cleanResults();
        };
        el.append(clear);
      } finally {
        await doc.destroy();
      }
      return;
    }
    if (active.id === "redact-pdf") {
      const { loadView, renderPage } = await import("./engines/pdf.js"),
        doc = await loadView(file);
      try {
        const i = Math.max(0, Number($("#option-page").value) - 1);
        if (i >= doc.numPages)
          throw new Error(L("Página inexistente", "Page does not exist"));
        const page = await doc.getPage(i + 1),
          v = page.getViewport({ scale: 1 }),
          c = await renderPage(doc, i, Math.min(1.5, 900 / v.width));
        if (generation !== previewGeneration) return;
        const nav = document.createElement("div");
        nav.className = "pdf-page-bar";
        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "secondary";
        prevBtn.textContent = "←";
        prevBtn.disabled = i === 0;
        prevBtn.onclick = () => {
          $("#option-page").value = i;
          renderInputPreview();
        };
        const pageInfo = document.createElement("span");
        const updateRedactLabel = () => {
          const marked = [...redactMap.entries()]
            .filter(([, b]) => b.length > 0)
            .map(([idx]) => idx + 1)
            .sort((a, b) => a - b);
          pageInfo.textContent =
            L(
              `Página ${i + 1} de ${doc.numPages}`,
              `Page ${i + 1} of ${doc.numPages}`,
            ) +
            (marked.length
              ? ` · ${L("Tarjadas", "Redacted")}: ${marked.join(", ")}`
              : "");
        };
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "secondary";
        nextBtn.textContent = "→";
        nextBtn.disabled = i >= doc.numPages - 1;
        nextBtn.onclick = () => {
          $("#option-page").value = i + 2;
          renderInputPreview();
        };
        nav.append(prevBtn, pageInfo, nextBtn);
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = L(
          "Arraste retângulos sobre dados confidenciais nesta página ou use o campo de termos acima.",
          "Drag rectangles over sensitive areas on this page or enter terms above.",
        );
        const stage = document.createElement("div");
        stage.className = "draw-stage";
        stage.append(c);
        const top = canvas(c.width, c.height);
        top.className = "draw-overlay";
        stage.append(top);
        const drawBoxes = (draft = null) => {
          const g = top.getContext("2d");
          g.clearRect(0, 0, top.width, top.height);
          const fillHex =
            $("#option-redactColor")?.value === "#ffffff"
              ? "#ffffff"
              : "#000000";
          const allBoxes = [...(redactMap.get(i) || [])];
          if (draft) allBoxes.push(draft);
          for (const b of allBoxes) {
            const bx = b.x * top.width,
              by = b.y * top.height,
              bw = b.w * top.width,
              bh = b.h * top.height;
            g.fillStyle = fillHex;
            g.globalAlpha = 0.88;
            g.fillRect(bx, by, bw, bh);
            g.globalAlpha = 1;
            g.save();
            g.strokeStyle = "#ff5a7a";
            g.lineWidth = 1.6;
            g.setLineDash([4, 3]);
            g.strokeRect(bx, by, bw, bh);
            g.restore();
          }
          updateRedactLabel();
        };
        let dragStart = null;
        const pt = (e) => {
          const r = top.getBoundingClientRect();
          return {
            x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
            y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
          };
        };
        top.onpointerdown = (e) => {
          dragStart = pt(e);
          top.setPointerCapture(e.pointerId);
        };
        top.onpointermove = (e) => {
          if (!dragStart) return;
          const p = pt(e);
          drawBoxes({
            x: Math.min(dragStart.x, p.x),
            y: Math.min(dragStart.y, p.y),
            w: Math.abs(dragStart.x - p.x),
            h: Math.abs(dragStart.y - p.y),
          });
        };
        top.onpointerup = (e) => {
          if (!dragStart) return;
          const p = pt(e);
          const box = {
            x: Math.min(dragStart.x, p.x),
            y: Math.min(dragStart.y, p.y),
            w: Math.abs(dragStart.x - p.x),
            h: Math.abs(dragStart.y - p.y),
          };
          dragStart = null;
          if (box.w >= 0.008 && box.h >= 0.008) {
            const list = redactMap.get(i) || [];
            list.push(box);
            redactMap.set(i, list);
            cleanResults();
          }
          drawBoxes();
        };
        top.onpointercancel = () => {
          dragStart = null;
          drawBoxes();
        };
        drawBoxes();
        const bar = document.createElement("div");
        bar.className = "refine-toolbar";
        const undoBtn = document.createElement("button");
        undoBtn.type = "button";
        undoBtn.className = "secondary small";
        undoBtn.textContent = "↶ " + L("Desfazer última", "Undo last");
        undoBtn.onclick = () => {
          const list = redactMap.get(i) || [];
          list.pop();
          if (!list.length) redactMap.delete(i);
          drawBoxes();
          cleanResults();
        };
        const clrBtn = document.createElement("button");
        clrBtn.type = "button";
        clrBtn.className = "secondary small";
        clrBtn.textContent = L("Limpar página", "Clear page");
        clrBtn.onclick = () => {
          redactMap.delete(i);
          drawBoxes();
          cleanResults();
        };
        bar.append(undoBtn, clrBtn);
        el.append(nav, hint, stage, bar);
      } finally {
        await doc.destroy();
      }
      return;
    }
    if (active.id === "pdf-metadata") {
      const { readPdfMetadata, loadView, renderPage } = await import(
        "./engines/pdf.js"
      );
      const meta = await readPdfMetadata(file);
      if (generation !== previewGeneration) return;
      if ($("#option-title")) $("#option-title").value = meta.title || "";
      if ($("#option-author")) $("#option-author").value = meta.author || "";
      if ($("#option-subject")) $("#option-subject").value = meta.subject || "";
      if ($("#option-keywords"))
        $("#option-keywords").value = meta.keywords || "";
      const info = document.createElement("p");
      info.className = "hint";
      info.textContent = `${meta.pages} ${L("página(s)", "page(s)")}${meta.creator ? ` · Creator: ${meta.creator}` : ""}${meta.producer ? ` · Producer: ${meta.producer}` : ""}`;
      el.append(info);
      const doc = await loadView(file);
      try {
        const p = await doc.getPage(1),
          v = p.getViewport({ scale: 1 }),
          c = await renderPage(doc, 0, Math.min(1, 360 / v.width));
        if (generation === previewGeneration) el.append(c);
      } finally {
        await doc.destroy();
      }
      return;
    }
    if (
      file.type.startsWith("image/") ||
      /\.(heic|heif|psd|tiff?|bmp|ico|cur)$/i.test(file.name)
    ) {
      const { loadAnyImage } = await import("./engines/image.js"),
        img = await loadAnyImage(file);
      if (generation !== previewGeneration) {
        img.close?.();
        return;
      }
      const c = canvas(
        Math.min(900, img.width),
        Math.round(img.height * Math.min(1, 900 / img.width)),
      );
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      img.close?.();
      el.append(c);
      if (active.id === "crop-image") setupCrop(c, el);
      else if (active.id === "remove-object") setupObjectMask(c, el);
      else if (active.id === "image-palette") setupPixelPicker(c, el);
      return;
    }
    if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
      const media = document.createElement(
        file.type.startsWith("video/") ? "video" : "audio",
      );
      media.controls = true;
      media.preload = "metadata";
      media.src = url(file, true);
      el.append(media);
      if ($("#option-start") && $("#option-duration")) {
        setupMediaTimeline(media, el);
      }
      return;
    }
    if (/\.pdf$/i.test(file.name)) {
      const { loadView, renderPage } = await import("./engines/pdf.js"),
        doc = await loadView(file);
      try {
        const p = await doc.getPage(1),
          v = p.getViewport({ scale: 1 }),
          c = await renderPage(doc, 0, Math.min(1, 500 / v.width));
        if (generation === previewGeneration) el.append(c);
      } finally {
        await doc.destroy();
      }
    }
  } catch (e) {
    if (generation === previewGeneration) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent =
        L("Prévia indisponível: ", "Preview unavailable: ") + e.message;
      el.append(p);
    }
  }
}
function setupPixelPicker(c, el) {
  c.style.cursor = "crosshair";
  const bar = document.createElement("div");
  bar.className = "pixel-picker-bar";
  bar.innerHTML = `<span class="pixel-swatch" id="pixelSwatch" style="background:#7928ca"></span><strong id="pixelHex">${L("Clique na imagem para capturar uma cor", "Click on the image to sample a pixel color")}</strong><small id="pixelRgb"></small>`;
  el.append(bar);
  c.onclick = (e) => {
    const r = c.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(c.width - 1, Math.floor(((e.clientX - r.left) * c.width) / r.width)),
    );
    const y = Math.max(
      0,
      Math.min(c.height - 1, Math.floor(((e.clientY - r.top) * c.height) / r.height)),
    );
    const px = c.getContext("2d").getImageData(x, y, 1, 1).data;
    const hex =
      "#" +
      [px[0], px[1], px[2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    const rgb = `rgb(${px[0]}, ${px[1]}, ${px[2]})`;
    bar.querySelector("#pixelSwatch").style.background = hex;
    bar.querySelector("#pixelHex").textContent = hex;
    bar.querySelector("#pixelRgb").textContent = rgb;
    navigator.clipboard
      ?.writeText(hex)
      .then(() => toast(`${L("Cor copiada:", "Color copied:")} ${hex}`))
      .catch(() => {});
  };
}
function setupObjectMask(c, el) {
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = L(
    "Pinte sobre o objeto, texto ou marca-d’água que deseja remover.",
    "Paint over the object, text or watermark you want to remove.",
  );
  const stage = document.createElement("div");
  stage.className = "draw-stage";
  c.replaceWith(hint, stage);
  stage.append(c);
  const maskCv = canvas(c.width, c.height);
  maskCv.className = "draw-overlay mask-overlay";
  stage.append(maskCv);
  inpaintMaskCanvas = maskCv;
  const g = maskCv.getContext("2d");
  let drawing = false;
  const pt = (e) => {
    const r = maskCv.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * maskCv.width) / r.width,
      ((e.clientY - r.top) * maskCv.height) / r.height,
    ];
  };
  maskCv.onpointerdown = (e) => {
    drawing = true;
    maskCv.setPointerCapture(e.pointerId);
    const [x, y] = pt(e);
    const sz = Math.max(4, Number($("#option-brushSize")?.value || 28));
    g.strokeStyle = "#ff3b6b";
    g.fillStyle = "#ff3b6b";
    g.lineWidth = sz;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.arc(x, y, sz / 2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x, y);
  };
  maskCv.onpointermove = (e) => {
    if (!drawing) return;
    g.lineTo(...pt(e));
    g.stroke();
  };
  maskCv.onpointerup = maskCv.onpointercancel = () => {
    if (!drawing) return;
    drawing = false;
    cleanResults();
  };
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "secondary small";
  clearBtn.style.marginTop = "10px";
  clearBtn.textContent = L("Limpar seleção pintada", "Clear painted mask");
  clearBtn.onclick = () => {
    g.clearRect(0, 0, maskCv.width, maskCv.height);
    cleanResults();
  };
  el.append(clearBtn);
}
function fmtClock(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${rem}`;
}
function setupMediaTimeline(media, el) {
  const mount = () => {
    const total = media.duration;
    if (!Number.isFinite(total) || total <= 0.1 || !el.isConnected) return;
    const startInput = $("#option-start"),
      durInput = $("#option-duration");
    if (!startInput || !durInput || el.querySelector(".trim-timeline")) return;
    let sVal = Math.max(0, Math.min(total - 0.1, Number(startInput.value) || 0));
    let dVal = Number(durInput.value) || Math.min(10, total);
    let eVal = Math.min(total, Math.max(sVal + 0.1, sVal + dVal));
    durInput.value = Number((eVal - sVal).toFixed(2));
    startInput.max = Number(total.toFixed(2));
    durInput.max = Number(total.toFixed(2));

    const wrap = document.createElement("div");
    wrap.className = "trim-timeline";
    wrap.innerHTML = `<div class="trim-head"><span class="trim-badge" id="trimStartLbl"></span><strong id="trimDurLbl"></strong><span class="trim-badge" id="trimEndLbl"></span></div><div class="trim-track-wrap"><div class="trim-track-bg"></div><div class="trim-track-fill" id="trimFill"></div><input type="range" class="trim-range trim-start" min="0" max="${total}" step="0.1" value="${sVal}" aria-label="${L("Início do corte", "Trim start")}"><input type="range" class="trim-range trim-end" min="0" max="${total}" step="0.1" value="${eVal}" aria-label="${L("Fim do corte", "Trim end")}"></div><div class="trim-actions"><button type="button" class="secondary small" id="trimPreviewBtn">▶ ${L("Pré-visualizar trecho", "Preview clip")}</button></div>`;
    el.append(wrap);

    const rStart = wrap.querySelector(".trim-start"),
      rEnd = wrap.querySelector(".trim-end"),
      fill = wrap.querySelector("#trimFill"),
      lblS = wrap.querySelector("#trimStartLbl"),
      lblD = wrap.querySelector("#trimDurLbl"),
      lblE = wrap.querySelector("#trimEndLbl"),
      prevBtn = wrap.querySelector("#trimPreviewBtn");

    const paintUI = () => {
      const leftPct = (sVal / total) * 100;
      const widthPct = Math.max(0.5, ((eVal - sVal) / total) * 100);
      fill.style.left = `${leftPct}%`;
      fill.style.width = `${widthPct}%`;
      lblS.textContent = `${L("Início", "Start")}: ${fmtClock(sVal)}`;
      lblE.textContent = `${L("Fim", "End")}: ${fmtClock(eVal)}`;
      lblD.textContent = `${L("Trecho", "Clip")}: ${(eVal - sVal).toFixed(1)}s`;
    };

    rStart.oninput = () => {
      sVal = Math.min(Number(rStart.value), eVal - 0.1);
      rStart.value = sVal;
      startInput.value = Number(sVal.toFixed(2));
      durInput.value = Number((eVal - sVal).toFixed(2));
      if (Number.isFinite(media.duration)) media.currentTime = sVal;
      paintUI();
      cleanResults();
    };
    rEnd.oninput = () => {
      eVal = Math.max(Number(rEnd.value), sVal + 0.1);
      rEnd.value = eVal;
      durInput.value = Number((eVal - sVal).toFixed(2));
      if (Number.isFinite(media.duration)) media.currentTime = eVal;
      paintUI();
      cleanResults();
    };
    const syncFromFields = () => {
      sVal = Math.max(0, Math.min(total - 0.1, Number(startInput.value) || 0));
      const d = Math.max(0.1, Number(durInput.value) || 0.1);
      eVal = Math.min(total, sVal + d);
      rStart.value = sVal;
      rEnd.value = eVal;
      paintUI();
    };
    startInput.addEventListener("input", syncFromFields);
    durInput.addEventListener("input", syncFromFields);

    let stopPreviewOnTime = false;
    media.addEventListener("timeupdate", () => {
      if (stopPreviewOnTime && media.currentTime >= eVal) {
        media.pause();
        stopPreviewOnTime = false;
      }
    });
    prevBtn.onclick = () => {
      stopPreviewOnTime = true;
      media.currentTime = sVal;
      media.play().catch(() => {});
    };
    paintUI();
  };
  if (Number.isFinite(media.duration) && media.duration > 0.1) mount();
  else media.addEventListener("loadedmetadata", mount, { once: true });
}
async function toggleCameraScanner() {
  const btn = $("#cameraScanBtn"),
    stage = $("#cameraStage"),
    video = $("#cameraVideo");
  if (!btn || !stage || !video) return;
  if (scannerStream) {
    stopScanner();
    stage.hidden = true;
    btn.textContent = "📷 " + L("Ler com a Câmera ao vivo", "Scan with Live Camera");
    status(t("ready"));
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    status(
      L(
        "Câmera não disponível neste navegador. Envie ou cole uma imagem.",
        "Camera unavailable in this browser. Upload or paste an image.",
      ),
      "error",
    );
    return;
  }
  try {
    cleanResults();
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = scannerStream;
    stage.hidden = false;
    await video.play();
    btn.textContent = "⏹ " + L("Parar câmera", "Stop camera");
    status(
      L(
        "Aponte a câmera para o QR Code ou Código de Barras…",
        "Point your camera at a QR code or barcode…",
      ),
    );
    const { scanCodesFromRgba } = await import("./engines/dev.js");
    const det =
      typeof BarcodeDetector !== "undefined" ? new BarcodeDetector() : null;
    let busy = false;
    scannerTimer = setInterval(async () => {
      if (busy || !scannerStream || video.readyState < 2) return;
      busy = true;
      try {
        const vw = video.videoWidth || 640,
          vh = video.videoHeight || 480;
        const sc = Math.min(1, 960 / Math.max(vw, vh));
        const cw = Math.max(1, Math.round(vw * sc)),
          ch = Math.max(1, Math.round(vh * sc));
        const c = canvas(cw, ch),
          g = c.getContext("2d");
        g.drawImage(video, 0, 0, cw, ch);
        const found = [];
        if (det) {
          try {
            for (const b of await det.detect(c)) {
              if (b.rawValue) found.push({ format: b.format, value: b.rawValue });
            }
          } catch {}
        }
        const px = g.getImageData(0, 0, cw, ch);
        for (const hit of await scanCodesFromRgba(px.data, cw, ch)) {
          if (!found.some((f) => f.value === hit.value)) found.push(hit);
        }
        if (found.length) {
          stopScanner();
          stage.hidden = true;
          btn.textContent =
            "📷 " + L("Ler com a Câmera ao vivo", "Scan with Live Camera");
          const txt = found.map((f) => `[${f.format}] ${f.value}`).join("\n\n");
          const jsonTxt = JSON.stringify(
            [{ source: "camera", codes: found }],
            null,
            2,
          );
          const outs = [
            {
              blob: new Blob([txt], { type: "text/plain;charset=utf-8" }),
              name: "camera-scan.txt",
              text: txt,
            },
            {
              blob: new Blob([jsonTxt], { type: "application/json" }),
              name: "camera-scan.json",
              text: jsonTxt,
            },
          ];
          results = outs;
          await renderResults(outs);
          status(t("done"), "success");
          toast(L("Código lido com sucesso!", "Code scanned successfully!"));
        }
      } finally {
        busy = false;
      }
    }, 280);
  } catch (err) {
    stopScanner();
    stage.hidden = true;
    status(err.message, "error");
  }
}
function setupCrop(c, el) {
  const stage = document.createElement("div");
  stage.className = "draw-stage";
  c.replaceWith(stage);
  stage.append(c);
  const top = canvas(c.width, c.height);
  top.className = "draw-overlay";
  stage.append(top);
  let start = null;
  const point = (e) => {
    const r = top.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  top.onpointerdown = (e) => {
    start = point(e);
    top.setPointerCapture(e.pointerId);
  };
  top.onpointermove = (e) => {
    if (!start) return;
    const p = point(e);
    crop = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(start.x - p.x),
      h: Math.abs(start.y - p.y),
    };
    const g = top.getContext("2d");
    g.clearRect(0, 0, top.width, top.height);
    g.fillStyle = "#0008";
    g.fillRect(0, 0, top.width, top.height);
    g.clearRect(
      crop.x * top.width,
      crop.y * top.height,
      crop.w * top.width,
      crop.h * top.height,
    );
    g.strokeStyle = "#00dfd8";
    g.lineWidth = 2;
    g.strokeRect(
      crop.x * top.width,
      crop.y * top.height,
      crop.w * top.width,
      crop.h * top.height,
    );
  };
  top.onpointerup = (e) => {
    if (start) {
      top.onpointermove(e);
      start = null;
      if (crop.w < 0.01 || crop.h < 0.01) crop = null;
      cleanResults();
    }
  };
  top.onpointercancel = () => (start = null);
}
function canvasHasInk(c) {
  if (!c) return false;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
  return false;
}
function paintSignatureStamp(g, w, h, pos, opts) {
  if (!pos) return false;
  const frac = Math.max(0.1, Math.min(0.9, Number(opts.stampScale || 32) / 100));
  const boxW = w * frac;
  let boxH = boxW * 0.36;
  const cx = Math.max(boxW / 2, Math.min(w - boxW / 2, pos.x * w));
  if (opts.signMode === "upload") {
    if (!opts.sigImg) return false;
    boxH = boxW * (opts.sigImg.height / Math.max(1, opts.sigImg.width));
    const cy = Math.max(boxH / 2, Math.min(h - boxH / 2, pos.y * h));
    g.drawImage(opts.sigImg, cx - boxW / 2, cy - boxH / 2, boxW, boxH);
    if (opts.guide) {
      g.save();
      g.strokeStyle = "#00dfd8";
      g.setLineDash([5, 4]);
      g.lineWidth = 1.5;
      g.strokeRect(cx - boxW / 2 - 4, cy - boxH / 2 - 4, boxW + 8, boxH + 8);
      g.restore();
    }
    return true;
  }
  const txt = String(opts.sigText || "").trim();
  if (!txt) {
    if (opts.guide) {
      const cy = Math.max(24, Math.min(h - 24, pos.y * h));
      g.save();
      g.strokeStyle = "#b58be8aa";
      g.setLineDash([5, 4]);
      g.strokeRect(cx - boxW / 2, cy - 22, boxW, 44);
      g.fillStyle = "#b58be8";
      g.font = "12px sans-serif";
      g.textAlign = "center";
      g.fillText(
        L("Digite sua rubrica acima", "Type your signature above"),
        cx,
        cy + 4,
      );
      g.restore();
    }
    return false;
  }
  g.save();
  let fSize = Math.max(14, Math.round(boxW * 0.24));
  const fontSpec = (px) =>
    `italic 600 ${px}px "Snell Roundhand", "Brush Script MT", Georgia, "Times New Roman", cursive, serif`;
  g.font = fontSpec(fSize);
  const measured = g.measureText(txt).width;
  if (measured > boxW * 0.92) {
    fSize = Math.max(11, Math.floor((fSize * boxW * 0.92) / measured));
    g.font = fontSpec(fSize);
  }
  boxH = Math.max(30, fSize * 1.7);
  const cy = Math.max(boxH / 2, Math.min(h - boxH / 2, pos.y * h));
  g.fillStyle = opts.color || "#1a1b4b";
  g.strokeStyle = opts.color || "#1a1b4b";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(txt, cx, cy - fSize * 0.08);
  g.beginPath();
  g.lineWidth = Math.max(1.2, fSize * 0.055);
  g.lineCap = "round";
  const lineW = Math.min(boxW * 0.85, g.measureText(txt).width * 1.05);
  g.moveTo(cx - lineW / 2, cy + fSize * 0.48);
  g.quadraticCurveTo(
    cx,
    cy + fSize * 0.34,
    cx + lineW / 2,
    cy + fSize * 0.52,
  );
  g.stroke();
  if (opts.guide) {
    g.strokeStyle = "#00dfd8";
    g.setLineDash([5, 4]);
    g.lineWidth = 1.5;
    g.strokeRect(cx - boxW / 2 - 4, cy - boxH / 2 - 4, boxW + 8, boxH + 8);
  }
  g.restore();
  return true;
}
function setupStampDrag(layer, pageIdx, redraw) {
  let dragging = false;
  const pt = (e) => {
    const r = layer.getBoundingClientRect();
    return {
      x: Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / r.width)),
      y: Math.max(0.05, Math.min(0.95, (e.clientY - r.top) / r.height)),
    };
  };
  layer.onpointerdown = (e) => {
    dragging = true;
    layer.setPointerCapture(e.pointerId);
    sigStamps.set(pageIdx, pt(e));
    redraw();
    cleanResults();
  };
  layer.onpointermove = (e) => {
    if (!dragging) return;
    sigStamps.set(pageIdx, pt(e));
    redraw();
  };
  layer.onpointerup = layer.onpointercancel = () => {
    dragging = false;
  };
}
function setupDrawing(c, onUpdate) {
  const g = c.getContext("2d");
  let drawing = false;
  const p = (e) => {
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ];
  };
  c.onpointerdown = (e) => {
    const [x, y] = p(e),
      brush = $("#option-brush")?.value || "pen";
    g.strokeStyle = $("#option-color").value;
    g.fillStyle = $("#option-color").value;
    g.lineWidth = brush === "highlight" ? 22 : 3;
    g.lineCap = "round";
    g.globalAlpha = brush === "highlight" ? 0.2 : 1;
    if (brush === "text") {
      g.font = `${Number($("#option-fontSize").value)}px sans-serif`;
      g.fillText($("#option-content").value, x, y);
      onUpdate?.();
      cleanResults();
      return;
    }
    drawing = true;
    c.setPointerCapture(e.pointerId);
    g.beginPath();
    g.moveTo(x, y);
  };
  c.onpointermove = (e) => {
    if (!drawing) return;
    g.lineTo(...p(e));
    g.stroke();
  };
  c.onpointerup = c.onpointercancel = () => {
    drawing = false;
    g.globalAlpha = 1;
    onUpdate?.();
    cleanResults();
  };
}
async function workerRun(tool, o, signal, progress) {
  const worker = new Worker(new URL("./process.worker.js", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException(t("cancelled"), "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    function end() {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    }
    worker.onerror = (e) => {
      end();
      reject(new Error(e.message));
    };
    worker.onmessage = ({ data }) => {
      if (data.event === "progress") progress(data.value, data.message);
      if (data.event === "done") {
        end();
        resolve(data.results);
      }
      if (data.event === "error") {
        end();
        reject(new Error(data.error));
      }
    };
    worker.postMessage({
      id: tool.id,
      category: tool.category,
      files,
      options: o,
    });
  });
}
async function execute(e) {
  e?.preventDefault();
  if (controller || !active) return;
  let current;
  try {
    validFiles(active, files);
    if (!$("#toolForm").reportValidity()) return;
    const o = options();
    if (active.id === "sign-pdf" || active.id === "annotate-pdf") {
      const signMode =
        active.id === "sign-pdf" ? o.signMode || "draw" : "draw";
      if (signMode === "type" && !String(o.sigText || "").trim())
        throw new Error(
          L(
            "Digite seu nome ou rubrica no campo acima antes de assinar.",
            "Type your name or initials above before signing.",
          ),
        );
      if (signMode === "upload" && !uploadedSigImg)
        throw new Error(
          L(
            "Escolha a imagem da assinatura antes de processar.",
            "Choose a signature image before processing.",
          ),
        );
      const candidatePages = new Set([
        ...pageOverlays.keys(),
        ...sigStamps.keys(),
      ]);
      const collected = [];
      for (const pIdx of [...candidatePages].sort((a, b) => a - b)) {
        const baseCv = pageOverlays.get(pIdx);
        const w = baseCv?.width || 800,
          h = baseCv?.height || 1100;
        const merged = canvas(w, h),
          mg = merged.getContext("2d");
        if (baseCv) mg.drawImage(baseCv, 0, 0);
        if (active.id === "sign-pdf" && signMode !== "draw" && sigStamps.has(pIdx)) {
          paintSignatureStamp(mg, w, h, sigStamps.get(pIdx), {
            signMode,
            sigText: o.sigText,
            stampScale: o.stampScale,
            color: o.color,
            sigImg: uploadedSigImg,
            guide: false,
          });
        }
        if (canvasHasInk(merged)) {
          collected.push({
            page: pIdx,
            bytes: await (await toBlob(merged)).arrayBuffer(),
          });
        }
      }
      if (!collected.length)
        throw new Error(
          L(
            "Faça uma anotação ou desenhe a assinatura antes de processar.",
            "Draw an annotation or signature before processing.",
          ),
        );
      o.overlays = collected;
    }
    if (active.id === "redact-pdf") {
      const redactBoxes = [...redactMap.entries()]
        .filter(([, b]) => b.length > 0)
        .map(([page, boxes]) => ({ page, boxes }));
      if (!redactBoxes.length && !String(o.terms || "").trim())
        throw new Error(
          L(
            "Desenhe ao menos uma tarja na prévia ou informe termos para ocultar.",
            "Draw at least one redaction box on the preview or enter terms to redact.",
          ),
        );
      o.redactBoxes = redactBoxes;
    }
    if (active.id === "remove-object") {
      if (!inpaintMaskCanvas || !canvasHasInk(inpaintMaskCanvas))
        throw new Error(
          L(
            "Pinte sobre o objeto ou marca-d’água na prévia antes de processar.",
            "Paint over the object or watermark on the preview before processing.",
          ),
        );
      o.maskBytes = await (
        await toBlob(inpaintMaskCanvas, "image/png")
      ).arrayBuffer();
    }
    if (active.id === "qr-code-studio" && qrLogoFile) {
      o.logoBytes = await qrLogoFile.arrayBuffer();
      o.logoMime = qrLogoFile.type || "image/png";
    }
    cleanResults();
    controller = new AbortController();
    current = controller;
    $("#toolFields").disabled = true;
    $("#execute").disabled = true;
    $("#clearInput").disabled = true;
    $("#cancel").hidden = false;
    const bar = $("#progress");
    bar.hidden = false;
    bar.removeAttribute("value");
    status(t("working"));
    const ctx = {
      signal: current.signal,
      progress: (p, m) => {
        if (p !== null) bar.value = p;
        if (m) status(m);
      },
      token: (s) => {
        $("#results").textContent = s;
      },
    };
    let out;
    if (active.model) {
      const engine = await import("./engines/ai.js");
      out = await engine.run(active.id, files, o, ctx);
    } else if (
      active.category === "text" ||
      (active.category === "dev" && active.id !== "qr-scanner") ||
      (active.category === "data" &&
        ![
          "xml-to-json",
          "json-to-xml",
          "xml-to-excel",
          "excel-to-xml",
          "excel-to-pdf",
        ].includes(active.id)) ||
      (active.category === "pdf" &&
        [
          "merge-pdf",
          "split-pdf",
          "split-all-pdf",
          "organize-pdf",
          "delete-pages",
          "rotate-pdf",
          "watermark-pdf",
          "number-pdf",
          "fill-pdf",
          "protect-pdf",
          "unlock-pdf",
          "crop-pdf",
          "nup-pdf",
          "pdf-metadata",
        ].includes(active.id)) ||
      (active.category === "image" &&
        !["svg-to-png", "heic-to-jpg"].includes(active.id) &&
        !files.some((f) => /\.(hei[cf]|svg)$/i.test(f.name)))
    )
      out = await workerRun(active, o, current.signal, ctx.progress);
    else {
      const engine = await (active.category === "image"
        ? import("./engines/image.js")
        : active.category === "pdf"
          ? import("./engines/pdf.js")
          : active.category === "media"
            ? import("./engines/media.js")
            : active.category === "data"
              ? import("./engines/data.js")
              : active.category === "dev"
                ? import("./engines/dev.js")
                : import("./engines/ai.js"));
      out = await engine.run(active.id, files, o, ctx);
    }
    if (current.signal.aborted)
      throw new DOMException(t("cancelled"), "AbortError");
    if (!out?.some((r) => r.blob))
      throw new Error(
        L("Nenhum arquivo foi gerado.", "No file was generated."),
      );
    results = out.filter((r) => r.blob);
    bar.value = 100;
    status(t("done"), "success");
    recent = [active.id, ...recent.filter((id) => id !== active.id)].slice(
      0,
      20,
    );
    save("recent", recent);
    await renderResults(out);
    $("#results").scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    renderCatalog();
  } catch (error) {
    if (current && controller !== current) return;
    cleanResults();
    status(
      error.name === "AbortError" ? t("cancelled") : error.message,
      error.name === "AbortError" ? "" : "error",
    );
  } finally {
    if (current && controller !== current) return;
    controller = null;
    if ($("#toolFields")) $("#toolFields").disabled = false;
    if ($("#execute")) $("#execute").disabled = false;
    if ($("#clearInput")) $("#clearInput").disabled = false;
    if ($("#cancel")) $("#cancel").hidden = true;
  }
}
async function renderResults(all = results) {
  const target = $("#results");
  target.replaceChildren();
  const actions = $("#resultActions");
  actions.replaceChildren();
  if (results.length > 1) {
    const zip = document.createElement("button");
    zip.className = "secondary";
    zip.textContent = t("downloadAll");
    zip.onclick = async () => {
      zip.disabled = true;
      try {
        download(await zipOutputs(results));
      } catch (e) {
        toast(e.message);
      } finally {
        zip.disabled = false;
      }
    };
    actions.append(zip);
  }
  for (let i = 0; i < results.length; i++) {
    const result = results[i],
      article = document.createElement("article");
    article.className = "result";
    const heading = document.createElement("div");
    heading.className = "result-heading";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = result.name;
    const size = document.createElement("small");
    size.textContent = humanBytes(result.blob.size);
    if (result.originalSize) {
      const diff = (1 - result.blob.size / result.originalSize) * 100;
      size.textContent +=
        diff >= 0
          ? ` · ${L("redução", "reduction")} ${diff.toFixed(1)}%`
          : ` · ${L("aumento", "increase")} ${Math.abs(diff).toFixed(1)}%`;
    }
    info.append(title, size);
    const btn = document.createElement("button");
    btn.className = "primary small";
    btn.textContent = t("download");
    btn.onclick = () => download(result);
    heading.append(info, btn);
    article.append(heading);
    const type = result.blob.type;
    if (type.startsWith("image/")) {
      const im = document.createElement("img");
      im.src = url(result.blob);
      im.alt = L("Resultado processado", "Processed result");
      im.loading = "lazy";
      article.append(im);
      if (i === 0 && files[0]?.type.startsWith("image/")) {
        const details = document.createElement("details");
        details.className = "before-after";
        details.open = [
          "remove-bg",
          "ai-remove-bg",
          "blur-bg",
          "remove-object",
          "compress-image",
          "ai-upscale",
          "colorize-image",
        ].includes(active?.id);
        const summary = document.createElement("summary");
        summary.textContent = L(
          "Comparar antes e depois",
          "Compare before and after",
        );
        const compare = document.createElement("div");
        compare.className = "compare-stage";
        const before = document.createElement("img");
        before.src = url(files[0]);
        before.alt = L("Original", "Original");
        const after = document.createElement("img");
        after.src = im.src;
        after.alt = im.alt;
        after.className = "compare-after";
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = 0;
        slider.max = 100;
        slider.value = 50;
        slider.setAttribute(
          "aria-label",
          L("Comparar antes e depois", "Compare before and after"),
        );
        slider.oninput = () =>
          (after.style.clipPath = `inset(0 ${100 - slider.value}% 0 0)`);
        compare.append(before, after);
        details.append(summary, compare, slider);
        article.append(details);
        if (
          active?.id === "remove-bg" ||
          active?.id === "ai-remove-bg" ||
          active?.id === "blur-bg"
        ) {
          const isBlurBg = active?.id === "blur-bg";
          const refine = document.createElement("details");
          refine.className = "refine-brush";
          const rSum = document.createElement("summary");
          rSum.textContent = isBlurBg
            ? L(
                "Refinar desfoque manualmente (pincel Desfocar / Manter nítido)",
                "Manually refine bokeh (Blur / Keep sharp brush)",
              )
            : L(
                "Refinar recorte manualmente (pincel Apagar / Restaurar)",
                "Manually refine cutout (Erase / Restore brush)",
              );
          const rBody = document.createElement("div");
          rBody.className = "refine-body";
          refine.append(rSum, rBody);
          let initialized = false;
          refine.ontoggle = async () => {
            if (!refine.open || initialized) return;
            initialized = true;
            const { bitmap } = await import("./utils.js");
            const [origBmp, cutBmp] = await Promise.all([
              bitmap(files[0]),
              bitmap(result.blob),
            ]);
            const rw = cutBmp.width,
              rh = cutBmp.height;
            const origCv = canvas(rw, rh);
            origCv.getContext("2d").drawImage(origBmp, 0, 0, rw, rh);
            origBmp.close?.();
            let blurCv = null;
            if (isBlurBg) {
              blurCv = canvas(rw, rh);
              const bgCtx = blurCv.getContext("2d");
              const radPx = Math.max(3, Number($("#option-radius")?.value || 18));
              bgCtx.filter = `blur(${radPx}px)`;
              bgCtx.drawImage(
                origCv,
                -radPx,
                -radPx,
                rw + radPx * 2,
                rh + radPx * 2,
              );
              bgCtx.filter = "none";
            }
            const editCv = canvas(rw, rh);
            editCv.className = "refine-canvas";
            const eg = editCv.getContext("2d");
            eg.drawImage(cutBmp, 0, 0, rw, rh);
            cutBmp.close?.();

            const bar = document.createElement("div");
            bar.className = "refine-toolbar";
            let mode = "erase",
              bSize = Math.max(12, Math.round(Math.min(rw, rh) * 0.04));
            const eraseBtn = document.createElement("button");
            eraseBtn.type = "button";
            eraseBtn.className = "secondary is-active";
            eraseBtn.textContent = isBlurBg
              ? L("Desfocar área", "Blur area")
              : L("Apagar fundo", "Erase");
            const restoreBtn = document.createElement("button");
            restoreBtn.type = "button";
            restoreBtn.className = "secondary";
            restoreBtn.textContent = isBlurBg
              ? L("Manter nítido", "Keep sharp")
              : L("Restaurar original", "Restore");
            eraseBtn.onclick = () => {
              mode = "erase";
              eraseBtn.classList.add("is-active");
              restoreBtn.classList.remove("is-active");
            };
            restoreBtn.onclick = () => {
              mode = "restore";
              restoreBtn.classList.add("is-active");
              eraseBtn.classList.remove("is-active");
            };
            const sizeWrap = document.createElement("label");
            sizeWrap.textContent = L("Pincel: ", "Brush: ");
            const sizeRange = document.createElement("input");
            sizeRange.type = "range";
            sizeRange.min = 4;
            sizeRange.max = Math.max(80, Math.round(Math.min(rw, rh) * 0.2));
            sizeRange.value = bSize;
            sizeRange.oninput = () => (bSize = Number(sizeRange.value));
            sizeWrap.append(sizeRange);
            bar.append(eraseBtn, restoreBtn, sizeWrap);
            rBody.append(bar, editCv);

            let painting = false;
            const paintAt = (e) => {
              const rect = editCv.getBoundingClientRect();
              const x = ((e.clientX - rect.left) * rw) / rect.width;
              const y = ((e.clientY - rect.top) * rh) / rect.height;
              const rad = bSize / 2;
              eg.save();
              if (mode === "erase") {
                if (isBlurBg && blurCv) {
                  eg.beginPath();
                  eg.arc(x, y, rad, 0, Math.PI * 2);
                  eg.clip();
                  eg.drawImage(blurCv, 0, 0);
                } else {
                  eg.globalCompositeOperation = "destination-out";
                  const grad = eg.createRadialGradient(
                    x,
                    y,
                    rad * 0.35,
                    x,
                    y,
                    rad,
                  );
                  grad.addColorStop(0, "rgba(0,0,0,1)");
                  grad.addColorStop(1, "rgba(0,0,0,0)");
                  eg.fillStyle = grad;
                  eg.beginPath();
                  eg.arc(x, y, rad, 0, Math.PI * 2);
                  eg.fill();
                }
              } else {
                eg.beginPath();
                eg.arc(x, y, rad, 0, Math.PI * 2);
                eg.clip();
                eg.drawImage(origCv, 0, 0);
              }
              eg.restore();
            };
            editCv.onpointerdown = (e) => {
              painting = true;
              editCv.setPointerCapture(e.pointerId);
              paintAt(e);
            };
            editCv.onpointermove = (e) => {
              if (painting) paintAt(e);
            };
            const commitStroke = async () => {
              if (!painting) return;
              painting = false;
              const updated = await toBlob(editCv, "image/png");
              result.blob = updated;
              const nextUrl = url(updated);
              im.src = nextUrl;
              after.src = nextUrl;
              size.textContent = humanBytes(updated.size);
            };
            editCv.onpointerup = commitStroke;
            editCv.onpointercancel = commitStroke;
          };
          article.append(refine);
        }
      }
    } else if (type === "application/pdf") {
      const frame = document.createElement("iframe");
      frame.src = url(result.blob);
      frame.title = L("Prévia do PDF", "PDF preview");
      article.append(frame);
    } else if (type.startsWith("video/") || type.startsWith("audio/")) {
      const el = document.createElement(
        type.startsWith("video/") ? "video" : "audio",
      );
      el.src = url(result.blob);
      el.controls = true;
      article.append(el);
    }
    if (result.text !== undefined) {
      const ta = document.createElement("textarea");
      ta.className = "text-result";
      ta.readOnly = true;
      ta.value = result.text;
      ta.rows = 12;
      ta.setAttribute("aria-label", t("output"));
      article.append(ta);
      const copy = document.createElement("button");
      copy.className = "secondary";
      copy.textContent = t("copy");
      copy.onclick = () =>
        navigator.clipboard
          .writeText(result.text)
          .then(() => toast(L("Copiado.", "Copied.")))
          .catch(() => {
            ta.select();
            toast(L("Selecione e copie o texto.", "Select and copy the text."));
          });
      article.append(copy);
    }
    const chains = tools.filter(
      (tool) =>
        tool.input === "files" &&
        !tool.external &&
        tool.id !== active.id &&
        tool.accept
          .split(",")
          .some(
            (a) =>
              a === type ||
              a === type.split("/")[0] + "/*" ||
              (a.startsWith(".") && result.name.toLowerCase().endsWith(a)),
          ),
    );
    if (chains.length) {
      const label = document.createElement("label");
      label.className = "chain-label";
      label.textContent = t("chain");
      const select = document.createElement("select");
      select.innerHTML =
        `<option value="">${L("Escolher ferramenta…", "Choose a tool…")}</option>` +
        chains
          .map(
            (tool) =>
              `<option value="${tool.id}">${esc(tool.title[lang])}</option>`,
          )
          .join("");
      select.onchange = () => {
        if (select.value)
          openTool(select.value, {
            chainFiles: [
              new File([result.blob], result.name, { type: result.blob.type }),
            ],
          });
      };
      label.append(select);
      article.append(label);
    }
    target.append(article);
  }
  const palObj = all.find((r) => Array.isArray(r.palette));
  if (palObj) {
    const grid = document.createElement("div");
    grid.className = "palette-grid";
    grid.innerHTML = palObj.palette
      .map(
        (p) =>
          `<button type="button" class="palette-swatch" data-copy-hex="${esc(p.hex.toUpperCase())}"><span class="swatch-chip" style="background:${esc(p.hex)}"></span><strong>${esc(p.hex.toUpperCase())}</strong><small>rgb(${p.rgb.join(",")}) · ${p.percent}%</small></button>`,
      )
      .join("");
    grid.onclick = (e) => {
      const btn = e.target.closest("[data-copy-hex]");
      if (!btn) return;
      const hex = btn.dataset.copyHex;
      navigator.clipboard
        ?.writeText(hex)
        .then(() => toast(`${L("Cor copiada:", "Color copied:")} ${hex}`))
        .catch(() => {});
    };
    target.prepend(grid);
  }
  const diffObj = all.find((r) => Array.isArray(r.diffRows));
  if (diffObj) {
    const rows = diffObj.diffRows;
    const added = rows.filter((r) => r.type === "add" || r.type === "change").length;
    const deleted = rows.filter((r) => r.type === "del" || r.type === "change").length;
    const same = rows.filter((r) => r.type === "same").length;
    const viewer = document.createElement("div");
    viewer.className = "diff-viewer";
    const stats = `<div class="diff-stats"><span class="diff-stat-add">+${added} ${L("adições", "added")}</span><span class="diff-stat-del">−${deleted} ${L("remoções", "removed")}</span><span>=${same} ${L("iguais", "unchanged")}</span></div>`;
    if (diffObj.viewMode === "unified") {
      viewer.innerHTML =
        stats +
        `<div class="diff-scroll"><table class="diff-table unified"><tbody>${rows
          .flatMap((r) => {
            if (r.type === "change") {
              return [
                `<tr class="diff-del"><td class="diff-ln">${r.leftNum ?? ""}</td><td class="diff-sym">−</td><td><code>${esc(r.leftText ?? "")}</code></td></tr>`,
                `<tr class="diff-add"><td class="diff-ln">${r.rightNum ?? ""}</td><td class="diff-sym">+</td><td><code>${esc(r.rightText ?? "")}</code></td></tr>`,
              ];
            }
            const cls =
              r.type === "add"
                ? "diff-add"
                : r.type === "del"
                  ? "diff-del"
                  : "diff-same";
            const sym = r.type === "add" ? "+" : r.type === "del" ? "−" : " ";
            const ln = r.type === "add" ? r.rightNum : r.leftNum;
            const txt = r.type === "add" ? r.rightText : r.leftText;
            return [
              `<tr class="${cls}"><td class="diff-ln">${ln ?? ""}</td><td class="diff-sym">${sym}</td><td><code>${esc(txt ?? "")}</code></td></tr>`,
            ];
          })
          .join("")}</tbody></table></div>`;
    } else {
      viewer.innerHTML =
        stats +
        `<div class="diff-scroll"><table class="diff-table split"><tbody>${rows
          .map((r) => {
            const lCls =
              r.type === "del" || r.type === "change" ? "diff-del" : "diff-same";
            const rCls =
              r.type === "add" || r.type === "change" ? "diff-add" : "diff-same";
            return `<tr><td class="diff-ln ${lCls}">${r.leftNum ?? ""}</td><td class="${lCls}"><code>${esc(r.leftText ?? "")}</code></td><td class="diff-ln ${rCls}">${r.rightNum ?? ""}</td><td class="${rCls}"><code>${esc(r.rightText ?? "")}</code></td></tr>`;
          })
          .join("")}</tbody></table></div>`;
    }
    target.prepend(viewer);
  }
  const rxObj = all.find((r) => r.regexPreview);
  if (rxObj) {
    const { text: srcTxt, spans, replaced, count } = rxObj.regexPreview;
    let cursor = 0,
      htmlParts = "";
    spans.forEach(([sIdx, eIdx], k) => {
      if (sIdx > cursor) htmlParts += esc(srcTxt.slice(cursor, sIdx));
      htmlParts += `<mark class="${k % 2 ? "rx-alt" : ""}">${esc(srcTxt.slice(sIdx, eIdx))}</mark>`;
      cursor = eIdx;
    });
    if (cursor < srcTxt.length) htmlParts += esc(srcTxt.slice(cursor));
    const box = document.createElement("div");
    box.className = "regex-viewer";
    box.innerHTML = `<div class="diff-stats"><span class="diff-stat-add">${count} ${L("ocorrência(s) destacada(s)", "match(es) highlighted")}</span></div><pre class="regex-highlight">${htmlParts || esc(srcTxt)}</pre>`;
    if (replaced !== null && replaced !== undefined) {
      const repHead = document.createElement("div");
      repHead.className = "diff-stats";
      repHead.style.marginTop = "12px";
      repHead.innerHTML = `<strong>${L("Resultado da substituição", "Replacement preview")}</strong>`;
      const repPre = document.createElement("pre");
      repPre.className = "regex-highlight";
      repPre.textContent = replaced;
      box.append(repHead, repPre);
    }
    target.prepend(box);
  }
  const md = all.find((r) => r.markdown !== undefined);
  if (md) {
    const { marked } = await import("marked"),
      { default: DOMPurify } = await import("dompurify");
    const preview = document.createElement("div");
    preview.className = "markdown-result";
    preview.innerHTML = DOMPurify.sanitize(marked.parse(md.markdown), {
      FORBID_TAGS: ["img", "iframe", "style", "form", "input"],
    });
    preview.querySelectorAll("a").forEach((a) => {
      a.rel = "noopener noreferrer";
      a.target = "_blank";
    });
    target.prepend(preview);
  }
}
async function toggleRecord() {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  const isVoice = active?.id === "voice-recorder";
  if (isVoice) {
    if (!navigator.mediaDevices?.getUserMedia) {
      status(
        L(
          "Este navegador não oferece captura de microfone.",
          "This browser does not offer microphone capture.",
        ),
        "error",
      );
      return;
    }
  } else if (!navigator.mediaDevices?.getDisplayMedia) {
    status(
      L(
        "Este navegador não oferece captura de tela.",
        "This browser does not offer screen capture.",
      ),
      "error",
    );
    return;
  }
  try {
    cleanResults();
    recordStream = isVoice
      ? await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      : await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
    const candidates = isVoice
      ? [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
        ]
      : [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime)
      throw new Error(
        L(
          "Nenhum formato de gravação compatível.",
          "No compatible recording format.",
        ),
      );
    if (isVoice && $("#recordWave")) {
      const waveCv = $("#recordWave");
      waveCv.hidden = false;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        waveAudioCtx = new AudioCtx();
        const srcNode = waveAudioCtx.createMediaStreamSource(recordStream);
        const analyser = waveAudioCtx.createAnalyser();
        analyser.fftSize = 128;
        srcNode.connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        const wg = waveCv.getContext("2d");
        const drawWave = () => {
          if (!waveAudioCtx) return;
          analyser.getByteFrequencyData(bins);
          wg.clearRect(0, 0, waveCv.width, waveCv.height);
          const barW = waveCv.width / bins.length;
          for (let i = 0; i < bins.length; i++) {
            const h = Math.max(3, (bins[i] / 255) * (waveCv.height - 8));
            wg.fillStyle = i % 2 ? "#64e5d6" : "#bc8eff";
            wg.fillRect(
              i * barW + 1,
              (waveCv.height - h) / 2,
              Math.max(2, barW - 2),
              h,
            );
          }
          waveRaf = requestAnimationFrame(drawWave);
        };
        drawWave();
      }
    }
    const targetToolId = active.id;
    recorder = new MediaRecorder(recordStream, { mimeType: mime });
    recordChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) recordChunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearInterval(elapsedTimer);
      cancelAnimationFrame(waveRaf);
      waveRaf = null;
      waveAudioCtx?.close?.().catch(() => {});
      waveAudioCtx = null;
      if ($("#recordWave")) $("#recordWave").hidden = true;
      recordStream?.getTracks().forEach((t) => t.stop());
      if (!recordChunks.length) return;
      const blob = new Blob(recordChunks, { type: mime.split(";")[0] });
      recordChunks = [];
      if (!active || active.id !== targetToolId || !dialog.open) return;
      const ext = isVoice
        ? mime.includes("mp4")
          ? "m4a"
          : mime.includes("ogg")
            ? "ogg"
            : "webm"
        : mime.includes("mp4")
          ? "mp4"
          : "webm";
      results = [
        {
          blob,
          name: isVoice
            ? `tinylab-voz.${ext}`
            : `tinylab-gravacao.${ext}`,
        },
      ];
      await renderResults();
      $("#recordToggle").textContent = L("Nova gravação", "New recording");
      status(t("done"), "success");
    };
    recordStream.getTracks()[0].onended = () => {
      if (recorder?.state === "recording") recorder.stop();
    };
    recorder.start(1000);
    $("#recordToggle").textContent = L(
      "Parar e preparar download",
      "Stop and prepare download",
    );
    let sec = 0;
    elapsedTimer = setInterval(() => {
      sec++;
      if ($("#recordClock"))
        $("#recordClock").textContent =
          `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    }, 1000);
    status(L("Gravando…", "Recording…"));
  } catch (e) {
    recordStream?.getTracks().forEach((t) => t.stop());
    status(e.message, "error");
  }
}
function stopRecorder(discard = false) {
  clearInterval(elapsedTimer);
  cancelAnimationFrame(waveRaf);
  waveRaf = null;
  waveAudioCtx?.close?.().catch(() => {});
  waveAudioCtx = null;
  if ($("#recordWave")) $("#recordWave").hidden = true;
  if (discard) recordChunks = [];
  if (recorder && recorder.state !== "inactive") {
    if (discard) recorder.onstop = null;
    recorder.stop();
  }
  recordStream?.getTracks().forEach((t) => t.stop());
  recorder = null;
  recordStream = null;
}
function closeWorkspace() {
  controller?.abort();
  controller = null;
  cleanInputUrls();
  stopRecorder(true);
  stopScanner();
  previewGeneration++;
  cleanResults();
  active = null;
  files = [];
  overlay = null;
  pageOverlays = new Map();
  sigStamps = new Map();
  redactMap = new Map();
  inpaintMaskCanvas = null;
  qrLogoFile = null;
  uploadedSigImg?.close?.();
  uploadedSigImg = null;
  stampRedraw = null;
  dialog.close();
  history.replaceState(null, "", APP_ROOT.pathname + location.search);
  updateDocTitle();
  renderCatalog();
  lastFocus?.focus();
}
$("#workspaceClose").onclick = closeWorkspace;
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeWorkspace();
});
document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-tool]");
  if (open) {
    if (
      open.tagName === "A" &&
      (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
    )
      return;
    e.preventDefault();
    openTool(open.dataset.tool);
  }
  const fav = e.target.closest("[data-favorite]");
  if (fav) {
    favorites = favorites.includes(fav.dataset.favorite)
      ? favorites.filter((id) => id !== fav.dataset.favorite)
      : [...favorites, fav.dataset.favorite];
    save("favorites", favorites);
    renderCatalog();
  }
  const cat = e.target.closest("[data-category]");
  if (cat) {
    category = cat.dataset.category;
    translate();
    if (cat.classList.contains("section-more")) {
      $(".discovery")?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }
  const filt = e.target.closest("[data-filter]");
  if (filt) {
    filter = filt.dataset.filter;
    translate();
  }
  const lay = e.target.closest("[data-layout]");
  if (lay) {
    layout = lay.dataset.layout;
    save("layout", layout);
    translate();
  }
  const heroOpen = e.target.closest("[data-hero-open]");
  if (heroOpen && heroFiles.length) {
    const target = findTool(heroOpen.dataset.heroOpen);
    openTool(heroOpen.dataset.heroOpen, {
      chainFiles: filesForTool(target, heroFiles),
      fromPaste: true,
    });
  }
  if (e.target.closest("#heroDropClear")) {
    heroFiles = [];
    if ($("#heroFileInput")) $("#heroFileInput").value = "";
    renderHeroDropMatched();
  }
});
$("#search").oninput = (e) => {
  query = e.target.value;
  renderCatalog();
};
if ($("#searchClear")) {
  $("#searchClear").onclick = () => {
    query = "";
    $("#search").value = "";
    renderCatalog();
    $("#search").focus();
  };
}
if ($("#heroDropzone") && $("#heroFileInput")) {
  const hDrop = $("#heroDropzone"),
    hInput = $("#heroFileInput");
  hDrop.addEventListener("click", (e) => {
    if (e.target.closest("input")) return;
    hInput.click();
  });
  hDrop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hInput.click();
    }
  });
  hInput.onchange = () => {
    const incoming = [...(hInput.files || [])];
    hInput.value = "";
    if (incoming.length) setHeroFiles(incoming);
  };
  hDrop.ondragover = (e) => {
    e.preventDefault();
    hDrop.classList.add("dragover");
  };
  hDrop.ondragleave = () => hDrop.classList.remove("dragover");
  hDrop.ondrop = (e) => {
    e.preventDefault();
    hDrop.classList.remove("dragover");
    const incoming = [...(e.dataTransfer?.files || [])];
    if (incoming.length) setHeroFiles(incoming);
  };
}
$("#langPt").onclick = () => {
  lang = "pt";
  save("lang", lang);
  translate();
};
$("#langEn").onclick = () => {
  lang = "en";
  save("lang", lang);
  translate();
};
$("#clearRecent").onclick = () => {
  recent = [];
  save("recent", recent);
  renderCatalog();
};
window.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) &&
    !dialog.open
  ) {
    e.preventDefault();
    $("#search").focus();
  }
});
window.addEventListener("paste", (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  const tag = document.activeElement?.tagName || "";
  const inEditable =
    /^(INPUT|TEXTAREA)$/.test(tag) || document.activeElement?.isContentEditable;
  if (inEditable && cd.getData("text/plain")) return;
  let pasted = [...(cd.files || [])];
  if (!pasted.length && cd.items) {
    for (const item of cd.items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) pasted.push(f);
      }
    }
  }
  if (!pasted.length) return;
  e.preventDefault();
  pasted = pasted.map((f, idx) => {
    if (!f.name || /^image\.(png|jpe?g|webp)$/i.test(f.name)) {
      const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
      return new File([f], `colado-${Date.now()}-${idx + 1}.${ext}`, {
        type: f.type || "image/png",
      });
    }
    return f;
  });
  openIncomingFiles(pasted, false);
});
function openIncomingFiles(incoming, isShare = false) {
  if (dialog.open && active?.input === "files") {
    addFiles(incoming);
    toast(
      isShare
        ? L(
            "Arquivo recebido via Compartilhar!",
            "File received via Share!",
          )
        : L(
            "Arquivo colado da área de transferência!",
            "File pasted from clipboard!",
          ),
    );
    return;
  }
  // Home page + Ctrl+V: show the Smart Dropzone suggestions instead of guessing a tool.
  if (!isShare && !dialog.open && $("#heroDropzone")) {
    setHeroFiles(incoming);
    toast(
      L(
        "Arquivo colado! Escolha a ferramenta sugerida no painel.",
        "File pasted! Pick a suggested tool in the panel.",
      ),
    );
    return;
  }
  const best = recommendToolsForFiles(incoming)[0] || findTool("file-hash");
  openTool(best.id, {
    chainFiles: filesForTool(best, incoming),
    fromPaste: true,
  });
  toast(
    isShare
      ? L(
          "Arquivo compartilhado! Escolha outra ferramenta acima ou processe direto.",
          "Shared file loaded! Switch tools above or process right away.",
        )
      : L(
          "Arquivo colado! Escolha outra ferramenta na barra acima ou processe direto.",
          "File pasted! Switch tools in the bar above or process right away.",
        ),
  );
}
const officialLinks = [
  ["Portal 4U", "Portal 4U", "https://4u.ia.br/"],
  ["Loja de Apps", "App Store", "https://4u.ia.br/loja/index.php"],
  ["Central de Ajuda", "Help Center", "https://4u.ia.br/suporte.html"],
  ["Sobre 4U", "About 4U", "https://4u.ia.br/sobre.html"],
  ["Termos", "Terms", "https://4u.ia.br/termos.html"],
  ["Privacidade", "Privacy", "https://4u.ia.br/politica.html"],
  ["GitHub", "GitHub", "https://github.com/4u-Labs"],
  ["Blog Dev", "Dev Blog", "https://4u-labs.github.io/"],
  [
    "AlternativeTo",
    "AlternativeTo",
    "https://alternativeto.net/user/4u-ia-br/added/",
  ],
  ["YouTube", "YouTube", "https://www.youtube.com/@fbr4g4"],
  ["Instagram", "Instagram", "https://www.instagram.com/fbr4g4/"],
  ["Facebook", "Facebook", "https://www.facebook.com/fbr4g4/"],
  ["X / Twitter", "X / Twitter", "https://x.com/fbr4g4"],
  ["LinkedIn", "LinkedIn", "https://www.linkedin.com/in/fbr4g4/"],
];
$("#aboutButton").onclick = () => {
  $("#aboutLinks").innerHTML = officialLinks
    .map(
      ([p, e, u]) =>
        `<a href="${u}" target="_blank" rel="noopener noreferrer">${L(p, e)} ↗</a>`,
    )
    .join("");
  $("#about").showModal();
};
document
  .querySelectorAll("[data-close]")
  .forEach(
    (b) => (b.onclick = () => document.getElementById(b.dataset.close).close()),
  );
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
const standalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone;
$("#installButton").hidden = standalone();
window.addEventListener(
  "appinstalled",
  () => ($("#installButton").hidden = true),
);
$("#installButton").onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } else {
    $("#installInstructions").textContent = L(
      "Android e computador: abra o menu do Chrome/Edge e escolha Instalar aplicativo. iPhone/iPad: no Safari, toque em Compartilhar → Adicionar à Tela de Início. A opção depende do suporte do navegador.",
      "Android and desktop: open the Chrome/Edge menu and choose Install app. iPhone/iPad: in Safari, tap Share → Add to Home Screen. Availability depends on browser support.",
    );
    $("#installDialog").showModal();
  }
};
function updateNetwork() {
  $("#network").textContent = navigator.onLine
    ? t("online")
    : t("offlineStatus");
  $("#network").classList.toggle("is-offline", !navigator.onLine);
}
window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);
$("#offlineButton").onclick = async () => {
  const btn = $("#offlineButton");
  btn.disabled = true;
  try {
    if (!("caches" in window))
      throw new Error(
        L(
          "Este navegador não oferece cache offline.",
          "This browser does not support offline caching.",
        ),
      );
    const manifest = await fetch(
      new URL("../offline-assets.json", import.meta.url),
      { cache: "no-store" },
    ).then((r) => r.json());
    const cache = await caches.open(manifest.cache);
    for (let i = 0; i < manifest.assets.length; i++) {
      const assetUrl = new URL(manifest.assets[i], APP_ROOT).href;
      if (!(await cache.match(assetUrl))) await cache.add(assetUrl);
      btn.textContent = `${L("Preparando", "Preparing")} ${i + 1}/${manifest.assets.length}`;
    }
    toast(
      L(
        "Ferramentas preparadas para offline. Os modelos de IA são baixados separadamente na primeira execução.",
        "Tools prepared for offline. AI models download separately on first use.",
      ),
    );
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t("offline");
  }
};
$("#accountButton").onclick = async () => {
  try {
    const { signIn } = await import("./auth.js");
    const user = await signIn(lang);
    toast(L("Conectado: ", "Signed in: ") + (user.display_name || user.email));
  } catch (e) {
    toast(e.message);
  }
};
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register(new URL("../sw.js", import.meta.url), {
      scope: APP_ROOT.pathname,
    })
    .catch(() =>
      toast(
        L(
          "Modo offline indisponível neste contexto.",
          "Offline mode unavailable in this context.",
        ),
      ),
    );
translate();
function detectUrlTool() {
  const hashTool = location.hash.slice(1);
  if (findTool(hashTool)) return hashTool;
  if (location.pathname.startsWith(APP_ROOT.pathname)) {
    const slug = location.pathname
      .slice(APP_ROOT.pathname.length)
      .replace(/^\/+|\/+$/g, "");
    if (slug && findTool(slug)) return slug;
  }
  const pageTool = document.documentElement.dataset.toolPage;
  if (pageTool && findTool(pageTool)) return pageTool;
  return "";
}
async function consumeSharedPayload() {
  const params = new URLSearchParams(location.search);
  if (params.get("shared") !== "1") return false;
  params.delete("shared");
  const qs = params.toString();
  history.replaceState(
    null,
    "",
    location.pathname + (qs ? `?${qs}` : "") + location.hash,
  );
  if (!("caches" in window)) return false;
  try {
    const metaUrl = new URL("__shared_meta__", APP_ROOT).href;
    for (const key of await caches.keys()) {
      if (!key.startsWith("tinylab-v2-")) continue;
      const cache = await caches.open(key);
      const res = await cache.match(metaUrl);
      if (!res) continue;
      const payload = await res.json();
      await cache.delete(metaUrl);
      const sharedFiles = [];
      for (const m of payload.files || []) {
        const fRes = await cache.match(m.url);
        if (fRes) {
          const blob = await fRes.blob();
          sharedFiles.push(
            new File([blob], m.name || "compartilhado", {
              type: m.type || blob.type || "application/octet-stream",
              lastModified: m.lastModified || Date.now(),
            }),
          );
          await cache.delete(m.url);
        }
      }
      if (sharedFiles.length) {
        openIncomingFiles(sharedFiles, true);
        return true;
      }
      if (payload.text) {
        openTool("qr-code-studio", { content: payload.text });
        toast(
          L(
            "Texto/link compartilhado carregado no QR Code Studio!",
            "Shared text/link loaded into QR Code Studio!",
          ),
        );
        return true;
      }
    }
  } catch {}
  return false;
}
consumeSharedPayload().then((handled) => {
  if (handled) return;
  const initial = detectUrlTool();
  if (initial) openTool(initial);
});
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (findTool(id) && id !== active?.id) openTool(id);
});
window.addEventListener("popstate", () => {
  const id = detectUrlTool();
  if (id && id !== active?.id) openTool(id);
  else if (!id && active) closeWorkspace();
});
