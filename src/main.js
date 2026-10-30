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
  category = "all",
  filter = "all",
  query = "",
  installPrompt = null;
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
  formFields = {},
  lastFocus = null,
  recorder = null,
  recordStream = null,
  recordChunks = [],
  elapsedTimer = null;
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
const messages = {
  explore: ["EXPLORE O LAB", "EXPLORE THE LAB"],
  artCaption: ["MENOS ETAPAS. MAIS CRIAÇÃO.", "LESS FRICTION. MORE CREATION."],
  quickPdf: ["Juntar PDF", "Merge PDF"],
  quickCompress: ["Comprimir imagem", "Compress image"],
  terms: ["Termos", "Terms"],
  privacyLink: ["Privacidade", "Privacy"],
  title: ["Seu laboratório.", "Your laboratory."],
  titleAccent: ["Infinitas possibilidades.", "Endless possibilities."],
  subtitle: [
    "PDFs, imagens, vídeos, arquivos e texto. Ferramentas úteis, sem anúncios e com processamento no seu dispositivo.",
    "PDFs, images, videos, files and text. Useful tools, no ads, processed on your device.",
  ],
  search: [
    "O que você quer fazer? Ex.: juntar PDF, reduzir foto…",
    "What would you like to do? E.g. merge PDF, compress photo…",
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
function translate() {
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  document.title = L(
    "TinyLab — Ferramentas privadas para o dia a dia",
    "TinyLab — Private tools for everyday tasks",
  );
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
  renderCatalog();
  updateNetwork();
}
function renderCatalog() {
  let list = searchTools(query, category, lang);
  if (filter === "favorites")
    list = list.filter((x) => favorites.includes(x.id));
  if (filter === "recent")
    list = recent.map((id) => list.find((t) => t.id === id)).filter(Boolean);
  $("#shownCount").textContent = `${list.length} ${t("countLabel")}`;
  $("#clearRecent").hidden = filter !== "recent" || !recent.length;
  $("#catalog").innerHTML = list.length
    ? list
        .map(
          (tool) =>
            `<article class="tool-card ${tool.category}"><div class="card-top"><span class="tool-icon">${icons[tool.category]}</span><button class="favorite ${favorites.includes(tool.id) ? "saved" : ""}" data-favorite="${tool.id}" aria-label="${L("Favoritar", "Favorite")} ${esc(tool.title[lang])}" aria-pressed="${favorites.includes(tool.id)}">${favorites.includes(tool.id) ? "★" : "☆"}</button></div><span class="card-category">${esc(categories.find((c) => c.id === tool.category).label[lang])}</span><h3><button data-tool="${tool.id}">${esc(tool.title[lang])}</button></h3><p>${esc(tool.description[lang])}</p><div class="card-bottom"><span class="local-badge">${tool.companion ? L("Computador local", "Local computer") : tool.model ? L("Modelo local", "Local model") : L("No navegador", "In browser")}</span><button class="card-open" data-tool="${tool.id}" aria-label="${t("open")} ${esc(tool.title[lang])}">↗</button></div></article>`,
        )
        .join("")
    : `<p class="catalog-empty">${t("empty")}</p>`;
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
          "1. Selecione os arquivos. 2. Ajuste as opções e confira a prévia. 3. Processe e baixe o resultado. Arraste a lista para mudar a ordem.",
          "1. Select your files. 2. Adjust options and check the preview. 3. Process and download. Drag the file list to change the order.",
        )
      : L(
          "Preencha os campos, processe e copie ou baixe o resultado.",
          "Fill in the fields, process, then copy or download the result.",
        );
  const special = {
    "sign-pdf": L(
      "Assinatura visual desenhada; não é uma assinatura digital com certificado. A página assinada é rasterizada.",
      "A drawn visual signature; this is not a certificate-based digital signature. The signed page is rasterized.",
    ),
    "annotate-pdf": L(
      "Desenhe sobre a página; clique para inserir o texto digitado. A página anotada é rasterizada.",
      "Draw on the page; click to insert the entered text. The annotated page is rasterized.",
    ),
    "crop-image": L(
      "Arraste sobre a imagem para selecionar o recorte.",
      "Drag on the image to select your crop.",
    ),
    "compress-pdf": L(
      "Otimização pode não reduzir PDFs já compactados. Rasterização descarta texto selecionável, links e formulários.",
      "Optimization may not reduce already compressed PDFs. Rasterization discards selectable text, links and forms.",
    ),
    "pdf-to-word": L(
      "Converte texto selecionável para DOCX com layout simplificado. Para PDFs digitalizados, use OCR primeiro.",
      "Converts selectable text into DOCX with simplified layout. For scanned PDFs, use OCR first.",
    ),
    "word-to-pdf": L(
      "O modo navegador usa layout simplificado; imagens são adicionadas ao final. O modo LibreOffice exige npm run dev neste computador.",
      "Browser mode uses simplified layout; images are appended. LibreOffice mode requires npm run dev on this computer.",
    ),
    "office-to-pdf": L(
      "Requer o conversor local: execute npm run dev na pasta do projeto. O arquivo passa somente pelo serviço deste computador, sem armazenamento permanente.",
      "Requires the local converter: run npm run dev in the project folder. Files only pass through this computer’s service, with no permanent storage.",
    ),
    "remove-bg": L(
      "Ideal para logos e fundos uniformes. Para pessoas, use Remover fundo de retrato.",
      "Best for logos and uniform backgrounds. For people, use Portrait background removal.",
    ),
    "video-frames": L(
      "Até 200 quadros por execução para proteger a memória do dispositivo.",
      "Up to 200 frames per run to protect device memory.",
    ),
    "subtitles-video": L(
      "Cria uma faixa de legendas selecionável. Ative-a no player após baixar.",
      "Creates a selectable subtitle track. Enable it in your player after downloading.",
    ),
    "screen-recorder": L(
      "O áudio depende do navegador e da origem escolhida. A gravação usa o formato suportado pelo navegador.",
      "Audio depends on the browser and capture source. Recording uses a format supported by your browser.",
    ),
    "upscale-image": L(
      "Ampliação por interpolação. Não recupera detalhes que não existem na imagem original.",
      "Interpolation-based enlargement. Does not recover details missing from the original image.",
    ),
  };
  return basic + " " + (special[tool.id] || "");
}
function modelNotice(tool) {
  if (!tool.model) return "";
  const size =
    tool.id === "ai-upscale"
      ? "~50 MB"
      : tool.id === "ai-remove-bg"
        ? "~26 MB"
        : tool.id === "transcribe"
          ? "~75 MB"
          : "~400 MB";
  return `<div class="model-notice"><span>✧</span><p>${L(`Na primeira execução, baixa um modelo (${size}). A inferência ocorre neste dispositivo. Resultados podem conter erros; revise antes de usar.`, `The first run downloads a model (${size}). Inference runs on this device. Results may contain errors; review before using.`)}</p></div>`;
}
function openTool(id, { chainFiles = [], content = "" } = {}) {
  const tool = findTool(id);
  if (!tool) return;
  controller?.abort();
  controller = null;
  cleanInputUrls();
  stopRecorder(true);
  previewGeneration++;
  lastFocus = document.activeElement;
  active = tool;
  files = [];
  pageOrder = null;
  crop = null;
  overlay = null;
  formFields = {};
  cleanResults();
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  $("#workspaceIcon").textContent = icons[tool.category];
  $("#workspaceCategory").textContent = categories.find(
    (c) => c.id === tool.category,
  ).label[lang];
  $("#workspaceTitle").textContent = tool.title[lang];
  $("#workspaceDescription").textContent = tool.description[lang];
  $("#workspaceBody").innerHTML =
    `<div class="workspace-input"><form id="toolForm"><fieldset id="toolFields">${tool.input === "files" ? `<label class="dropzone" id="dropzone" tabindex="0"><input id="fileInput" type="file" accept="${esc(tool.accept)}" ${tool.multiple ? "multiple" : ""} hidden><span class="drop-icon">＋</span><strong>${t("drop")}</strong><small>${t("dropSub")}</small></label><ol id="fileList" class="file-list"></ol>` : ""}${tool.input === "record" ? `<div class="record-panel"><span>◉</span><p>${helpText(tool)}</p><button type="button" class="primary" id="recordToggle">${L("Iniciar gravação", "Start recording")}</button><p id="recordClock">00:00</p></div>` : ""}<div class="controls">${tool.options.map(field).join("")}</div><div id="formFields" class="controls"></div><div id="inputPreview" class="input-preview"></div>${modelNotice(tool)}<details class="help"><summary>${t("help")}</summary><p>${esc(helpText(tool))}</p></details></fieldset><div class="execution-bar">${tool.input !== "record" ? `<button class="primary" type="submit" id="execute">${tool.model ? L("Baixar modelo e processar", "Download model & process") : t("run")} <span>→</span></button>` : ""}<button type="button" class="secondary" id="clearInput">${t("reset")}</button><button type="button" class="secondary danger" id="cancel" hidden>${t("cancel")}</button></div></form><div class="progress-box"><progress id="progress" max="100" value="0" hidden></progress><p id="status" role="status" aria-live="polite">${t("ready")}</p></div></div><div class="workspace-output"><div class="output-heading"><span class="eyebrow">${t("output")}</span><div id="resultActions"></div></div><div id="results"></div></div>`;
  cleanResults();
  $("#toolForm").addEventListener("submit", execute);
  $("#clearInput").onclick = () => {
    controller?.abort();
    cleanInputUrls();
    stopRecorder(true);
    files = [];
    previewGeneration++;
    pageOrder = null;
    crop = null;
    overlay = null;
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
    if (e.target.name === "page") renderInputPreview();
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
        const stage = document.createElement("div");
        stage.className = "draw-stage";
        stage.append(c);
        overlay = canvas(c.width, c.height);
        overlay.className = "draw-overlay";
        stage.append(overlay);
        el.append(stage);
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "secondary";
        clear.textContent = L("Apagar desenho", "Clear drawing");
        clear.onclick = () => {
          overlay
            .getContext("2d")
            .clearRect(0, 0, overlay.width, overlay.height);
          cleanResults();
        };
        el.append(clear);
        setupDrawing(overlay);
      } finally {
        await doc.destroy();
      }
      return;
    }
    if (file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)) {
      const { bitmap } = await import("./utils.js"),
        img = await bitmap(file);
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
function setupDrawing(c) {
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
    if (overlay) {
      const pixels = overlay
        .getContext("2d")
        .getImageData(0, 0, overlay.width, overlay.height).data;
      let drawn = false;
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i]) {
          drawn = true;
          break;
        }
      if (!drawn)
        throw new Error(
          L(
            "Faça uma anotação ou desenhe a assinatura antes de processar.",
            "Draw an annotation or signature before processing.",
          ),
        );
      o.overlay = await (await toBlob(overlay)).arrayBuffer();
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
    if (
      ["text", "dev"].includes(active.category) ||
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
          "compress-image",
          "ai-upscale",
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
  if (!navigator.mediaDevices?.getDisplayMedia) {
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
    recordStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime)
      throw new Error(
        L(
          "Nenhum formato de gravação compatível.",
          "No compatible recording format.",
        ),
      );
    recorder = new MediaRecorder(recordStream, { mimeType: mime });
    recordChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) recordChunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearInterval(elapsedTimer);
      recordStream.getTracks().forEach((t) => t.stop());
      if (!recordChunks.length) return;
      const blob = new Blob(recordChunks, { type: mime.split(";")[0] });
      recordChunks = [];
      if (!active || active.id !== "screen-recorder" || !dialog.open) return;
      results = [
        {
          blob,
          name: `tinylab-gravacao.${mime.includes("mp4") ? "mp4" : "webm"}`,
        },
      ];
      await renderResults();
      $("#recordToggle").textContent = L("Nova gravação", "New recording");
      status(t("done"), "success");
    };
    recordStream.getVideoTracks()[0].onended = () => {
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
  previewGeneration++;
  cleanResults();
  active = null;
  files = [];
  overlay = null;
  dialog.close();
  history.replaceState(null, "", location.pathname + location.search);
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
  if (open) openTool(open.dataset.tool);
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
  }
  const filt = e.target.closest("[data-filter]");
  if (filt) {
    filter = filt.dataset.filter;
    translate();
  }
});
$("#search").oninput = (e) => {
  query = e.target.value;
  renderCatalog();
};
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
    const manifest = await fetch("./offline-assets.json", {
      cache: "no-store",
    }).then((r) => r.json());
    const cache = await caches.open(manifest.cache);
    for (let i = 0; i < manifest.assets.length; i++) {
      const asset = manifest.assets[i];
      if (!(await cache.match(asset))) await cache.add(asset);
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
    .register("./sw.js")
    .catch(() =>
      toast(
        L(
          "Modo offline indisponível neste contexto.",
          "Offline mode unavailable in this context.",
        ),
      ),
    );
translate();
if (findTool(location.hash.slice(1))) openTool(location.hash.slice(1));
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (findTool(id) && id !== active?.id) openTool(id);
});
