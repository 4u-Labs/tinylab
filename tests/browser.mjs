import { tools } from "../src/catalog.js";
import { canvas, toBlob } from "../src/utils.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as PDF from "../src/engines/pdf.js";
import * as Image from "../src/engines/image.js";
import * as Media from "../src/engines/media.js";
import * as Data from "../src/engines/data.js";
import * as Text from "../src/engines/text.js";
import * as Dev from "../src/engines/dev.js";
import * as AI from "../src/engines/ai.js";
const rows = document.getElementById("rows");
let fixture;
const makeFile = (blob, name, type) =>
  new File([blob], name, { type: type || blob.type });
async function fixtures() {
  if (fixture) return fixture;
  const c = canvas(800, 300),
    g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 800, 300);
  g.fillStyle = "#000";
  g.font = "52px sans-serif";
  g.fillText("TINYLAB TESTE 2026", 30, 120);
  const png = await toBlob(c);
  const image = makeFile(png, "fixture.png");
  const d = await PDFDocument.create(),
    font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const page = d.addPage([400, 500]);
    page.drawText("TinyLab test document page " + (i + 1), {
      x: 30,
      y: 450,
      size: 16,
      font,
    });
    if (i === 0) {
      const embedded = await d.embedPng(await png.arrayBuffer());
      page.drawImage(embedded, { x: 20, y: 160, width: 320, height: 120 });
    }
  }
  const form = d.getForm(),
    field = form.createTextField("name");
  field.setText("Original");
  field.addToPage(d.getPage(0), { x: 30, y: 70, width: 200, height: 30 });
  const check = form.createCheckBox("approved");
  check.addToPage(d.getPage(0), { x: 250, y: 70, width: 20, height: 20 });
  const pdf = makeFile(
    new Blob([await d.save()], { type: "application/pdf" }),
    "fixture.pdf",
  );
  const secure = (
    await PDF.run("protect-pdf", [pdf], { password: "fixture" })
  )[0];
  const csv = makeFile(
    new Blob(["name,amount\nAna,12\nBia,34\nCaio,56"], { type: "text/csv" }),
    "fixture.csv",
  );
  const json = makeFile(
    new Blob(['[{"name":"Ana","amount":12},{"name":"Bia","amount":34}]'], {
      type: "application/json",
    }),
    "fixture.json",
  );
  const xml = makeFile(
    new Blob(
      [
        "<data><row><name>Ana</name><amount>12</amount></row><row><name>Bia</name><amount>34</amount></row></data>",
      ],
      { type: "application/xml" },
    ),
    "fixture.xml",
  );
  const excel = (await Data.run("csv-to-excel", [csv], {}))[0],
    zip = (await Data.run("create-zip", [image, csv], {}))[0];
  const docx = (await PDF.run("pdf-to-word", [pdf], {}))[0];
  const video = makeFile(
    await fetch("./video.mp4").then((r) => r.blob()),
    "video.mp4",
    "video/mp4",
  );
  fixture = {
    c,
    image,
    pdf,
    secure: makeFile(secure.blob, "secure.pdf"),
    csv,
    json,
    xml,
    excel: makeFile(excel.blob, "fixture.xlsx"),
    zip: makeFile(zip.blob, "fixture.zip"),
    docx: makeFile(docx.blob, "fixture.docx"),
    video,
  };
  return fixture;
}
function log(id, status, detail = "") {
  const row = document.createElement("tr");
  row.innerHTML = "<td></td><td></td><td></td>";
  row.cells[0].textContent = id;
  row.cells[1].textContent = status;
  row.cells[2].textContent = detail;
  row.dataset.status = status;
  rows.append(row);
  document.getElementById("summary").textContent =
    `${rows.querySelectorAll("[data-status=PASS]").length} passed · ${rows.querySelectorAll("[data-status=FAIL]").length} failed`;
}
let busy = false;
async function runStandard() {
  if (busy) return;
  busy = true;
  document.getElementById("run").disabled = true;
  const f = await fixtures();
  for (const tool of tools.filter(
    (t) => !t.model && t.id !== "screen-recorder",
  )) {
    const o = Object.fromEntries(tool.options.map((x) => [x.key, x.value]));
    o.content = o.content || "TinyLab test text. Texto de teste.";
    o.width = 160;
    o.height = 0;
    o.quality = 80;
    o.cell = 100;
    o.duration = 0.4;
    o.start = 0;
    o.pages = "";
    o.fontSize = 20;
    let files = tool.input === "files" ? [f.image] : [];
    let engine = {
      pdf: PDF,
      image: Image,
      media: Media,
      data: Data,
      text: Text,
      dev: Dev,
      ai: AI,
    }[tool.category];
    try {
      if (tool.category === "pdf") {
        files = [f.pdf];
        if (tool.id === "merge-pdf") files = [f.pdf, f.pdf];
        if (tool.id === "images-to-pdf") files = [f.image, f.image];
        if (tool.id === "word-to-pdf" || tool.id === "office-to-pdf")
          files = [f.docx];
        if (tool.id === "unlock-pdf") {
          files = [f.secure];
          o.password = "fixture";
        }
        if (tool.id === "protect-pdf") o.password = "fixture";
        if (tool.id === "delete-pages") o.pages = "2";
        if (tool.id === "organize-pdf") o.pageOrder = [2, 0];
        if (tool.id === "fill-pdf")
          o.formFields = { name: "Updated", approved: true };
        if (tool.id === "sign-pdf" || tool.id === "annotate-pdf")
          o.overlay = await (await toBlob(f.c)).arrayBuffer();
      }
      if (tool.category === "image") {
        if (tool.id === "collage-image") files = [f.image, f.image];
        if (tool.id === "svg-to-png")
          files = [
            new File(
              [
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="purple"/></svg>',
              ],
              "fixture.svg",
              { type: "image/svg+xml" },
            ),
          ];
        if (tool.id === "heic-to-jpg") {
          const r = await fetch("./fixture.heic");
          if (!r.ok) throw new Error("HEIC fixture missing");
          files = [makeFile(await r.blob(), "fixture.heic", "image/heic")];
        }
        if (tool.id === "crop-image")
          o.crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
      }
      if (tool.category === "media") {
        files = [f.video];
        if (tool.id === "merge-audio") files = [f.video, f.video];
        if (tool.id === "gif-to-video") {
          const gif = (
            await Media.run("video-to-gif", [f.video], {
              width: 160,
              fps: 5,
              start: 0,
              duration: 0.4,
            })
          )[0];
          files = [makeFile(gif.blob, "fixture.gif")];
        }
      }
      if (tool.category === "data") {
        files = tool.id.startsWith("json-")
          ? [f.json]
          : tool.id.startsWith("xml-")
            ? [f.xml]
            : tool.id.includes("excel") && tool.id !== "csv-to-excel"
              ? [f.excel]
              : [f.csv];
        if (tool.id === "create-zip") files = [f.image, f.csv];
        if (tool.id === "extract-zip") files = [f.zip];
        o.rows = 2;
      }
      if (tool.category === "dev") {
        if (tool.id === "json-formatter") o.content = '{"test":true}';
        if (tool.id === "file-hash") files = [f.csv];
      }
      if (tool.id === "ocr-image") files = [f.image];
      if (tool.id === "text-replace") {
        o.find = "TinyLab";
        o.replacement = "Laboratory";
      }
      const out = await engine.run(tool.id, files, o, {
        progress: (p, m) => {
          document.getElementById("current").textContent =
            tool.id + " " + (m || Math.round(p || 0) + "%");
        },
      });
      if (!out?.some((r) => r.blob?.size)) throw new Error("No output bytes");
      if (tool.id === "ocr-image" && !out[0].text.includes("2026"))
        throw new Error("OCR did not recover the fixture text");
      if (tool.id === "resize-image") {
        const img = await createImageBitmap(out[0].blob);
        if (img.width !== 160 || img.height !== 60)
          throw new Error("Wrong resize dimensions");
        img.close();
      }
      log(
        tool.id,
        "PASS",
        out
          .filter((r) => r.blob)
          .map((r) => r.blob.size + " B")
          .join(", "),
      );
    } catch (e) {
      log(tool.id, "FAIL", e.message);
    }
  }
  // Exercise formats and alternative paths not selected by default.
  for (const [id, engine, files, o] of [
    ["avif-encoding", Image, [f.image], { format: "avif", quality: 80 }],
    [
      "pdf-raster-compression",
      PDF,
      [f.pdf],
      { mode: "raster", quality: 70, scale: 1 },
    ],
    ["word-layout-local", PDF, [f.docx], { mode: "companion" }],
    ["xml-roundtrip", Data, [f.json], { root: "root" }],
  ]) {
    try {
      const operation =
        id === "avif-encoding"
          ? "convert-image"
          : id === "pdf-raster-compression"
            ? "compress-pdf"
            : id === "word-layout-local"
              ? "word-to-pdf"
              : "json-to-xml";
      const out = await engine.run(operation, files, o);
      if (!out[0].blob.size) throw new Error("No output");
      log(id, "PASS", out[0].blob.size + " B");
    } catch (e) {
      log(id, "FAIL", e.message);
    }
  }
  busy = false;
  document.getElementById("current").textContent = "Standard suite complete";
  document.getElementById("run").disabled = false;
}
async function runModels() {
  if (busy) return;
  busy = true;
  const f = await fixtures();
  const selected = new URL(location.href).searchParams
    .get("models")
    ?.split(",");
  for (const tool of tools.filter(
    (t) => t.model && (!selected || selected.includes(t.id)),
  )) {
    try {
      let files = [],
        o = Object.fromEntries(tool.options.map((x) => [x.key, x.value]));
      o.lang = "pt";
      o.content =
        "O TinyLab reúne ferramentas locais para PDF, imagens e vídeo. Os arquivos são processados no dispositivo do usuário. A nova versão oferece busca e processamento em lote.";
      if (tool.id === "summarize-pdf") files = [f.pdf];
      if (tool.id === "ai-remove-bg") files = [f.image];
      if (tool.id === "ai-upscale") {
        const c = canvas(48, 48);
        c.getContext("2d").drawImage(f.c, 0, 0, 48, 48);
        files = [makeFile(await toBlob(c), "small.png")];
      }
      if (tool.id === "transcribe") {
        o.language = "english";
        files = [
          makeFile(
            await fetch("./speech.wav").then((r) => r.blob()),
            "speech.wav",
            "audio/wav",
          ),
        ];
      }
      const out = await AI.run(tool.id, files, o, {
        progress: (p, m) =>
          (document.getElementById("current").textContent =
            tool.id + " " + (m || Math.round(p || 0) + "%")),
        token: (s) => (document.getElementById("stream").textContent = s),
      });
      if (!out?.some((r) => r.blob?.size)) throw new Error("No output");
      log(
        tool.id,
        "PASS",
        out[0].text?.slice(0, 180) || out[0].blob.size + " bytes",
      );
    } catch (e) {
      log(tool.id, "FAIL", e.message);
    }
  }
  document.getElementById("current").textContent = "Model suite complete";
  busy = false;
}
document.getElementById("run").onclick = () =>
  runStandard().catch((e) => {
    log("suite", "FAIL", e.stack);
    busy = false;
  });
document.getElementById("models").onclick = () =>
  runModels().catch((e) => {
    log("models", "FAIL", e.stack);
    busy = false;
  });
