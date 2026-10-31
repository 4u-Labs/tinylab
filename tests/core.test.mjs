import test from "node:test";
import assert from "node:assert/strict";
import { tools, searchTools } from "../src/catalog.js";
import { pageIndices, validFiles } from "../src/utils.js";
import {
  password,
  crc16,
  pixPayload,
  encodeBarcode,
  scanCodesFromRgba,
  decodeJwt,
  testRegex,
  run as dev,
} from "../src/engines/dev.js";
import {
  compareLines,
  diffStructured,
  run as text,
} from "../src/engines/text.js";
import {
  removeBackground,
  inpaintImage,
  vectorizeToSvg,
  decodePsd,
  decodeTiff,
  decodeIco,
  extractColorPalette,
  colorizeImageData,
} from "../src/engines/image.js";
import {
  command,
  atempoChain,
  synthesizeSpeechWav,
} from "../src/engines/media.js";
import { PDFDocument } from "pdf-lib";
import {
  run as pdf,
  readPdfMetadata,
  findTermRedactionBoxes,
  extractText,
} from "../src/engines/pdf.js";
import { run as data } from "../src/engines/data.js";
import * as XLSX from "xlsx";
test("catalog IDs are unique, bilingual and all route to engines", () => {
  assert.equal(new Set(tools.map((t) => t.id)).size, tools.length);
  assert.equal(tools.length, 150);
  for (const t of tools) {
    assert.ok(t.title.pt && t.title.en && t.description.pt && t.description.en);
    if (t.external) assert.match(t.external, /^https:\/\/4u\.ia\.br\/app\//);
    for (const o of t.options) assert.ok(o.label.pt && o.label.en);
  }
});
test("search handles accents, synonyms and category", () => {
  assert.ok(searchTools("reduzir foto").some((t) => t.id === "compress-image"));
  assert.ok(searchTools("audio").some((t) => t.id === "extract-audio"));
  assert.ok(searchTools("juntar", "pdf").every((t) => t.category === "pdf"));
  assert.ok(searchTools("tarjar").some((t) => t.id === "redact-pdf"));
  assert.ok(searchTools("carrossel").some((t) => t.id === "split-image"));
  assert.ok(searchTools("vetor").some((t) => t.id === "image-to-svg"));
  assert.ok(searchTools("baixou").some((t) => t.id === "baixou-downloader"));
  assert.ok(searchTools("slides").some((t) => t.id === "pdf-to-pptx"));
  assert.ok(searchTools("ebook").some((t) => t.id === "epub-pdf"));
  assert.ok(searchTools("figurinha").some((t) => t.id === "sticker-maker"));
  assert.ok(
    searchTools("photoshop").some((t) => t.id === "pro-image-converter"),
  );
  assert.ok(searchTools("paleta").some((t) => t.id === "image-palette"));
  assert.ok(searchTools("curriculo").some((t) => t.id === "ai-resume"));
});
test("page ranges fail rather than silently returning a different document", () => {
  assert.deepEqual(pageIndices("1-3, 5, 3", 5), [0, 1, 2, 4]);
  assert.throws(() => pageIndices("0,2", 5));
  assert.throws(() => pageIndices("3-1", 5));
  assert.throws(() => pageIndices("6", 5));
  assert.throws(() => pageIndices("2-x", 5));
});
test("passwords use all selected character classes and requested lengths", () => {
  for (let i = 0; i < 100; i++) {
    const p = password(20);
    assert.equal(p.length, 20);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[a-z]/);
    assert.match(p, /\d/);
    assert.match(p, /[^a-z\d]/i);
  }
  assert.match(password(32, "digits"), /^\d{32}$/);
});
test("PIX CRC16 matches the standard test vector and encoded payload", () => {
  assert.equal(crc16("123456789"), "29B1");
  const p = pixPayload("test@example.com", "JOAO", "SAO PAULO", 12.34);
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  assert.ok(p.includes("540512.34"));
});
test("UTF-8 base64 round-trip preserves Portuguese and emoji", async () => {
  const encoded = (
    await dev("base64", [], { content: "ação 🧪", mode: "encode" })
  )[0].text;
  assert.equal(
    (await dev("base64", [], { content: encoded, mode: "decode" }))[0].text,
    "ação 🧪",
  );
});
test("text comparison identifies ordered additions and deletions", () => {
  const out = compareLines("a\nb\nc", "a\nx\nc");
  assert.match(out, /\+ x/);
  assert.match(out, /- b/);
});
test("background removal preserves enclosed regions in outer mode", () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < 25; i++) pixels.set([255, 255, 255, 255], i * 4);
  for (const i of [6, 7, 8, 11, 13, 16, 17, 18])
    pixels.set([0, 0, 0, 255], i * 4);
  removeBackground(pixels, 5, 5, 10, "outer");
  assert.equal(pixels[3], 0);
  assert.equal(pixels[12 * 4 + 3], 255);
  assert.equal(pixels[6 * 4 + 3], 255);
});
test("background removal feathers outer anti-aliased boundary without touching interior", () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < 25; i++) pixels.set([255, 255, 255, 255], i * 4);
  for (const i of [6, 7, 8, 11, 13, 16, 17, 18])
    pixels.set([235, 235, 235, 255], i * 4);
  pixels.set([235, 235, 235, 255], 12 * 4);
  removeBackground(pixels, 5, 5, 10, "outer", 40);
  assert.equal(pixels[3], 0);
  assert.ok(pixels[6 * 4 + 3] > 0 && pixels[6 * 4 + 3] < 255);
  assert.equal(pixels[12 * 4 + 3], 255);
});
test("PDF operations produce correct page counts, rotation and order", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  doc.addPage([200, 100]);
  doc.addPage([300, 100]);
  const file = new File([await doc.save()], "fixture.pdf", {
    type: "application/pdf",
  });
  const split = (await pdf("split-pdf", [file], { pages: "2-3" }))[0];
  const parsed = await PDFDocument.load(await split.blob.arrayBuffer());
  assert.equal(parsed.getPageCount(), 2);
  assert.equal(parsed.getPage(0).getWidth(), 200);
  const organized = (
    await pdf("organize-pdf", [file], { pageOrder: [2, 0] })
  )[0];
  assert.equal(
    (await PDFDocument.load(await organized.blob.arrayBuffer()))
      .getPage(0)
      .getWidth(),
    300,
  );
  const rotated = (
    await pdf("rotate-pdf", [file], { pages: "2", angle: 90 })
  )[0];
  const r = await PDFDocument.load(await rotated.blob.arrayBuffer());
  assert.equal(r.getPage(0).getRotation().angle, 0);
  assert.equal(r.getPage(1).getRotation().angle, 90);
});
test("PDF signing and compression preserve selectable vector text and shrink embedded images", async () => {
  const zlib = await import("node:zlib");
  const { StandardFonts } = await import("pdf-lib");
  const { extractText } = await import("../src/engines/pdf.js");
  function pngChunk(type, buf) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length);
    const t = Buffer.from(type);
    let c = -1;
    for (const b of Buffer.concat([t, buf])) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ -1) >>> 0);
    return Buffer.concat([len, t, buf, crc]);
  }
  function makePng(w, h, rgba = false) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = rgba ? 6 : 2;
    const ch = rgba ? 4 : 3;
    const raw = Buffer.alloc(h * (1 + w * ch));
    for (let y = 0; y < h; y++) {
      raw[y * (1 + w * ch)] = 0;
      for (let x = 0; x < w; x++) {
        const o = y * (1 + w * ch) + 1 + x * ch;
        raw[o] = (x * 17 + y * 3) & 255;
        raw[o + 1] = (y * 23 + x * 5) & 255;
        raw[o + 2] = ((x ^ y) * 31) & 255;
        if (rgba) raw[o + 3] = 200;
      }
    }
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", zlib.deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  }
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await d.embedFont(StandardFonts.Helvetica);
  const p1 = d.addPage([500, 700]);
  p1.drawText("RELATORIO OFICIAL 2026", { x: 40, y: 640, size: 20, font });
  p1.drawText("Item", { x: 40, y: 580, size: 11, font });
  p1.drawText("Valor", { x: 240, y: 580, size: 11, font });
  p1.drawText("Servico A", { x: 40, y: 560, size: 11, font: bodyFont });
  p1.drawText("R$ 150", { x: 240, y: 560, size: 11, font: bodyFont });
  const bigImg = await d.embedPng(makePng(80, 80, false));
  p1.drawImage(bigImg, { x: 40, y: 200, width: 200, height: 200 });
  const p2 = d.addPage([500, 700]);
  p2.drawText("SEGUNDA PAGINA VETORIAL", { x: 40, y: 640, size: 14, font: bodyFont });
  const srcBytes = await d.save();
  const srcFile = new File([srcBytes], "contract.pdf", { type: "application/pdf" });

  // 1. Multi-page sign-pdf keeps vector text intact on all pages
  const sigPng = makePng(24, 12, true);
  const signed = (
    await pdf("sign-pdf", [srcFile], {
      overlays: [{ page: 0, bytes: sigPng }],
      applyScope: "all",
    })
  )[0];
  const signedTexts = await extractText(
    new File([signed.blob], "signed.pdf", { type: "application/pdf" }),
  );
  assert.match(signedTexts[0], /RELATORIO OFICIAL 2026/);
  assert.match(signedTexts[1], /SEGUNDA PAGINA VETORIAL/);

  // 2. Smart compress-pdf replaces embedded RGB stream and preserves selectable text
  const compressed = (
    await pdf(
      "compress-pdf",
      [srcFile],
      { mode: "lossless", quality: 65, scale: 1 },
      { encodeJpeg: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    )
  )[0];
  assert.ok(compressed.blob.size < srcBytes.byteLength);
  const compTexts = await extractText(
    new File([compressed.blob], "comp.pdf", { type: "application/pdf" }),
  );
  assert.match(compTexts[0], /RELATORIO OFICIAL 2026/);

  // 3. Structured pdf-to-word -> browser word-to-pdf round-trip preserves headings and table data
  const docxOut = (await pdf("pdf-to-word", [srcFile], {}))[0];
  const docxFile = new File([docxOut.blob], "contract.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const roundPdf = (
    await pdf("word-to-pdf", [docxFile], { mode: "browser" })
  )[0];
  const roundTexts = await extractText(
    new File([roundPdf.blob], "round.pdf", { type: "application/pdf" }),
  );
  assert.match(roundTexts[0], /RELATORIO OFICIAL 2026/);
  assert.match(roundTexts[0], /Servico A/);
});
test("PDF encryption requires the password and unlocking restores readable pages", async () => {
  const d = await PDFDocument.create();
  d.addPage([100, 100]);
  const f = new File([await d.save()], "test.pdf", { type: "application/pdf" });
  const encrypted = (
    await pdf("protect-pdf", [f], { password: "fixture-only-pass" })
  )[0];
  const { PDF } = await import("@libpdf/core");
  const locked = await PDF.load(
    new Uint8Array(await encrypted.blob.arrayBuffer()),
  );
  assert.equal(locked.isEncrypted, true);
  assert.equal(locked.isAuthenticated, false);
  const ef = new File([encrypted.blob], "secure.pdf", {
    type: "application/pdf",
  });
  await assert.rejects(() => pdf("unlock-pdf", [ef], { password: "wrong" }));
  const unlocked = (
    await pdf("unlock-pdf", [ef], { password: "fixture-only-pass" })
  )[0];
  assert.equal(
    (await PDFDocument.load(await unlocked.blob.arrayBuffer())).getPageCount(),
    1,
  );
});
test("spreadsheet conversion and splitting retain all data and headers", async () => {
  const f = new File(["name,amount\nAna,12\nBia,34\nCaio,56"], "data.csv", {
    type: "text/csv",
  });
  const json = (await data("csv-to-json", [f], {}))[0];
  assert.equal(JSON.parse(json.text).length, 3);
  const split = await data("split-csv", [f], { rows: 2 });
  assert.equal(split.length, 2);
  assert.match(split[1].text, /name,amount/);
  assert.match(split[1].text, /Caio,56/);
  const excel = (await data("csv-to-excel", [f], {}))[0];
  assert.equal(
    XLSX.read(await excel.blob.arrayBuffer(), { type: "array" }).SheetNames
      .length,
    1,
  );
});
test("ZIP round-trip retains bytes and prevents duplicate-name loss", async () => {
  const files = [new File(["one"], "same.txt"), new File(["two"], "same.txt")];
  const zipped = (await data("create-zip", files, {}))[0];
  const unpacked = await data(
    "extract-zip",
    [new File([zipped.blob], "files.zip")],
    {},
  );
  assert.equal(unpacked.length, 2);
  assert.equal(new Set(unpacked.map((f) => f.name)).size, 2);
  assert.deepEqual(
    (await Promise.all(unpacked.map((f) => f.blob.text()))).sort(),
    ["one", "two"],
  );
});
test("media commands do not interpolate shell strings or lose requested options", () => {
  const c = command(
    "trim-video",
    { start: 2, duration: 3 },
    "input.mp4",
    "out.mp4",
  );
  assert.ok(c.includes("2") && c.includes("3"));
  assert.equal(c.at(-1), "out.mp4");
  assert.ok(
    command("extract-audio", { format: "wav" }, "in.mp4", "out.wav").includes(
      "pcm_s16le",
    ),
  );
});
test("file validation rejects wrong formats and oversize batches", () => {
  const tool = tools.find((t) => t.id === "merge-pdf");
  assert.throws(() =>
    validFiles(tool, [new File(["x"], "bad.txt", { type: "text/plain" })]),
  );
  assert.throws(() => validFiles(tool, []));
  assert.doesNotThrow(() =>
    validFiles(tool, [
      new File(["%PDF-"], "doc.pdf", { type: "application/pdf" }),
    ]),
  );
});

test("service worker only removes TinyLab caches and excludes APIs/POST/external traffic", async () => {
  const vm = await import("node:vm");
  const { readFile } = await import("node:fs/promises");
  const events = {},
    removed = [];
  const context = {
    URL,
    self: {
      location: { href: "https://example.test/app/tinylab/sw.js" },
      addEventListener: (name, fn) => (events[name] = fn),
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [
        "office-cache-v4",
        "tinylab-cache-v1",
        "tinylab-v2-obsolete",
      ],
      delete: async (k) => removed.push(k),
    },
    Promise,
  };
  vm.runInNewContext(
    await readFile(new URL("../sw.js", import.meta.url), "utf8"),
    context,
  );
  let activated;
  events.activate({ waitUntil: (p) => (activated = p) });
  await activated;
  assert.deepEqual(removed.sort(), ["tinylab-cache-v1", "tinylab-v2-obsolete"]);
  for (const [method, url] of [
    ["POST", "https://example.test/app/tinylab/action"],
    ["GET", "https://example.test/app/tinylab/api/data"],
    ["GET", "https://example.test/app/office/"],
    ["GET", "https://external.test/image.png"],
  ]) {
    let intercepted = false;
    events.fetch({
      request: { method, url, headers: new Headers() },
      respondWith: () => (intercepted = true),
    });
    assert.equal(intercepted, false);
  }
});

test("Etapa 3 PDF tools: N-up, metadata edit/wipe, form flatten, markdown-to-pdf, pdf-to-excel and permanent redaction", async () => {
  const zlib = await import("node:zlib");
  const { StandardFonts } = await import("pdf-lib");
  const { extractText } = await import("../src/engines/pdf.js");

  function png1x1() {
    function chunk(type, buf) {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(buf.length);
      const t = Buffer.from(type);
      let c = -1;
      for (const b of Buffer.concat([t, buf])) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE((c ^ -1) >>> 0);
      return Buffer.concat([len, t, buf, crc]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }

  // 1. Build 4-page PDF with table on page 1 and confidential CPF
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 4; i++) {
    const p = d.addPage([500, 700]);
    p.drawText(`PAGINA_${i + 1}`, { x: 40, y: 650, size: 14, font });
    if (i === 0) {
      p.drawText("SEGREDO_CPF_12345678900", { x: 40, y: 610, size: 12, font });
      p.drawText("Produto", { x: 40, y: 550, size: 11, font });
      p.drawText("Preco", { x: 260, y: 550, size: 11, font });
      p.drawText("Teclado", { x: 40, y: 530, size: 11, font });
      p.drawText("R$ 290", { x: 260, y: 530, size: 11, font });
    }
  }
  const form = d.getForm();
  const tf = form.createTextField("cliente");
  tf.setText("Maria");
  tf.addToPage(d.getPage(0), { x: 40, y: 450, width: 140, height: 22 });

  const srcFile = new File([await d.save()], "etapa3.pdf", {
    type: "application/pdf",
  });

  // 2. N-up 4-per-sheet -> 1 vector sheet retaining text
  const nupOut = (
    await pdf("nup-pdf", [srcFile], {
      layout: "4",
      orientation: "auto",
      border: "yes",
    })
  )[0];
  const nupLoaded = await PDFDocument.load(await nupOut.blob.arrayBuffer());
  assert.equal(nupLoaded.getPageCount(), 1);

  // 3. Metadata edit & wipe
  const editedMeta = (
    await pdf("pdf-metadata", [srcFile], {
      mode: "edit",
      title: "Relatorio 4u",
      author: "Fabiano",
      subject: "Auditoria",
      keywords: "pdf, local",
    })
  )[0];
  const metaFile = new File([editedMeta.blob], "meta.pdf", {
    type: "application/pdf",
  });
  const readBack = await readPdfMetadata(metaFile);
  assert.equal(readBack.title, "Relatorio 4u");
  assert.equal(readBack.author, "Fabiano");
  const wipedMeta = (
    await pdf("pdf-metadata", [metaFile], { mode: "clear" })
  )[0];
  const wipedRead = await readPdfMetadata(
    new File([wipedMeta.blob], "wiped.pdf", { type: "application/pdf" }),
  );
  assert.equal(wipedRead.title, "");
  assert.equal(wipedRead.author, "");

  // 4. Flatten forms removes interactive fields while preserving page count
  const flatOut = (
    await pdf("flatten-pdf", [srcFile], { mode: "forms" })
  )[0];
  const flatDoc = await PDFDocument.load(await flatOut.blob.arrayBuffer());
  assert.equal(flatDoc.getForm().getFields().length, 0);

  // 5. Markdown to PDF
  const mdOut = (
    await pdf("markdown-to-pdf", [], {
      content: "# Titulo Principal\n\nParagrafo de teste.\n\n| Col1 | Col2 |\n| --- | --- |\n| A1 | B1 |",
    })
  )[0];
  const mdTexts = await extractText(
    new File([mdOut.blob], "md.pdf", { type: "application/pdf" }),
  );
  assert.match(mdTexts[0], /Titulo Principal/);
  assert.match(mdTexts[0], /A1/);

  // 6. PDF to Excel extracts columns into XLSX & CSV
  const xlOuts = await pdf("pdf-to-excel", [srcFile], {
    pages: "1",
    format: "both",
  });
  assert.equal(xlOuts.length, 2);
  const wb = XLSX.read(await xlOuts[0].blob.arrayBuffer(), { type: "array" });
  const csvTxt = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
  assert.match(csvTxt, /Produto,Preco/);
  assert.match(csvTxt, /Teclado,R\$ 290/);

  // 7. Permanent PDF redaction destroys secret text on page 1 while keeping page 2 intact
  const autoBoxes = await findTermRedactionBoxes(srcFile, "SEGREDO_CPF");
  assert.ok((autoBoxes.get(0) || []).length >= 1);
  const redactedOut = (
    await pdf(
      "redact-pdf",
      [srcFile],
      { terms: "SEGREDO_CPF", redactColor: "#000000" },
      { rasterizeRedactedPage: async () => png1x1() },
    )
  )[0];
  const redTexts = await extractText(
    new File([redactedOut.blob], "red.pdf", { type: "application/pdf" }),
  );
  assert.doesNotMatch(redTexts[0], /SEGREDO_CPF/);
  assert.match(redTexts[1], /PAGINA_2/);
});

test("Etapa 3 Image tools: multi-pass inpainting and Marching Squares SVG vectorizer", () => {
  // 1. Inpaint reconstructs masked red spot inside horizontal gradient
  const W = 24,
    H = 24;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const val = x * 10;
      rgba[i * 4] = val;
      rgba[i * 4 + 1] = val;
      rgba[i * 4 + 2] = val;
      rgba[i * 4 + 3] = 255;
      if (x >= 10 && x <= 13 && y >= 10 && y <= 13) {
        rgba[i * 4] = 255;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        mask[i] = 1;
      }
    }
  }
  inpaintImage(rgba, mask, W, H, 16);
  const mid = (11 * W + 11) * 4;
  assert.ok(Math.abs(rgba[mid] - 110) < 12);
  assert.ok(Math.abs(rgba[mid + 1] - 110) < 12);

  // 2. Vectorizer produces scalable SVG with evenodd paths and drops white border
  const vRgba = new Uint8ClampedArray(20 * 20 * 4);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const i = (y * 20 + x) * 4;
      const inside = x >= 4 && x <= 15 && y >= 4 && y <= 15;
      const hole = x >= 8 && x <= 11 && y >= 8 && y <= 11;
      const dark = inside && !hole;
      vRgba.set(dark ? [20, 40, 200, 255] : [255, 255, 255, 255], i);
    }
  }
  const svgColor = vectorizeToSvg(vRgba, 20, 20, {
    mode: "color",
    colors: 3,
    detail: "medium",
    ignoreWhite: "yes",
  });
  assert.match(svgColor, /<svg[^>]+viewBox="0 0 20 20"/);
  assert.match(svgColor, /fill-rule="evenodd"/);
  assert.doesNotMatch(svgColor, /fill="#ffffff"/i);
});

test("Etapa 3 Media, Dev & Text tools: speed/crop FFmpeg args, 1D/2D barcode round-trip, JWT HMAC and regex/diff", async () => {
  // 1. Media speed & crop commands
  assert.equal(atempoChain(3), "atempo=2,atempo=1.5");
  assert.equal(atempoChain(0.5), "atempo=0.5");
  const cropArgs = command(
    "crop-video",
    { aspect: "9:16", mode: "pad" },
    "in.mp4",
    "out.mp4",
  );
  assert.ok(cropArgs.some((a) => a.includes("boxblur")));
  const speedArgs = command(
    "speed-media",
    { speed: 2, _hasVideo: true, _hasAudio: true },
    "in.mp4",
    "out.mp4",
  );
  assert.ok(speedArgs.some((a) => a.includes("setpts=PTS/2")));
  assert.ok(speedArgs.some((a) => a.includes("atempo=2")));

  // 2. Barcode encode -> RGBA scanline render -> scanCodesFromRgba round-trip
  for (const [fmt, val, expected] of [
    ["CODE128", "TinyLab-42", "TinyLab-42"],
    ["EAN13", "789123456789", "7891234567895"],
    ["EAN8", "7891234", "78912342"],
  ]) {
    const enc = encodeBarcode(val, fmt);
    const quiet = 12,
      scale = 3,
      w = (enc.bits.length + quiet * 2) * scale,
      h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 0; i < enc.bits.length; i++) {
      if (enc.bits[i] === "1") {
        for (let y = 4; y < h - 4; y++) {
          for (let dx = 0; dx < scale; dx++) {
            const p = (y * w + (quiet + i) * scale + dx) * 4;
            rgba[p] = rgba[p + 1] = rgba[p + 2] = 0;
          }
        }
      }
    }
    const hits = await scanCodesFromRgba(rgba, w, h);
    assert.equal(hits[0]?.value, expected);
  }

  // 3. QR Code Studio outputs vector SVG + text payload
  const qrOuts = await dev("qr-code-studio", [], {
    kind: "text",
    content: "https://4u.ia.br/app/tinylab/",
    outputFormat: "svg",
    ecLevel: "H",
    color: "#111111",
    background: "#ffffff",
  });
  assert.ok(qrOuts.some((o) => o.name.endsWith(".svg")));

  // 4. JWT decoder + WebCrypto HS256 verification
  const b64u = (str) =>
    Buffer.from(str)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const hdr = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pld = b64u(JSON.stringify({ sub: "user-1", exp: 4102444800 }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("super-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${hdr}.${pld}`),
  );
  const sig = Buffer.from(sigBuf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwtValid = await decodeJwt(`${hdr}.${pld}.${sig}`, "super-secret");
  assert.equal(jwtValid.signatureCheck, "valid");
  assert.equal(jwtValid.claims.expired, false);
  const jwtInvalid = await decodeJwt(`${hdr}.${pld}.${sig}`, "wrong-secret");
  assert.equal(jwtInvalid.signatureCheck, "invalid");

  // 5. Regex tester & structured diff
  const rx = testRegex("(\\w+)@([\\w.]+)", "g", "Contato: oi@4u.ia.br", "[$1]");
  assert.equal(rx.count, 1);
  assert.equal(rx.matches[0].captures[0], "oi");
  assert.equal(rx.replaced, "Contato: [oi]");

  const diffOut = await text("compare-text", [], {
    content: "linha 1\nvelha\nlinha 3",
    other: "linha 1\nnova\nlinha 3",
    viewMode: "split",
  });
  assert.ok(Array.isArray(diffOut[1].diffRows));
  const changed = diffStructured("a\nb", "a\nc");
  assert.equal(changed[1].type, "change");
  assert.equal(changed[1].leftText, "b");
  assert.equal(changed[1].rightText, "c");
});

test("Etapa 4 SEO static tool pages, sitemap.xml, Open Graph banner and PWA share_target", async () => {
  const vm = await import("node:vm");
  const { readFile, stat } = await import("node:fs/promises");

  // 1. Sitemap contains root + all 148 internal tools, excluding external apps
  const sitemap = await readFile(
    new URL("../sitemap.xml", import.meta.url),
    "utf8",
  );
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const internalCount = tools.filter((t) => !t.external).length;
  assert.equal(internalCount, 148);
  assert.equal(locs.length, internalCount + 1);
  assert.equal(locs[0], "https://4u.ia.br/app/tinylab/");
  assert.ok(locs.includes("https://4u.ia.br/app/tinylab/merge-pdf/"));
  assert.ok(locs.includes("https://4u.ia.br/app/tinylab/pdf-to-pptx/"));
  assert.ok(locs.includes("https://4u.ia.br/app/tinylab/pro-image-converter/"));
  assert.ok(locs.includes("https://4u.ia.br/app/tinylab/text-to-speech/"));
  assert.ok(!locs.some((u) => u.includes("clipcut-studio")));

  // 2. OG banner assets exist
  const bannerStat = await stat(new URL("../og-banner.jpg", import.meta.url));
  assert.ok(bannerStat.size > 10_000);

  // 3. Static per-tool landing pages contain canonical, JSON-LD WebApplication+FAQPage, and seoToolSheet
  for (const tid of ["merge-pdf", "remove-bg", "qr-code-studio"]) {
    const html = await readFile(
      new URL(`../${tid}/index.html`, import.meta.url),
      "utf8",
    );
    assert.ok(html.includes(`data-tool-page="${tid}"`));
    assert.ok(
      html.includes(
        `<link rel="canonical" href="https://4u.ia.br/app/tinylab/${tid}/" />`,
      ),
    );
    assert.ok(html.includes('src="../assets/main.js"'));
    assert.ok(html.includes('id="seoToolSheet"'));
    const ldMatch = html.match(
      /<script type="application\/ld\+json" id="schemaJson">([\s\S]*?)<\/script>/,
    );
    assert.ok(ldMatch, `Missing JSON-LD in ${tid}`);
    const parsed = JSON.parse(ldMatch[1]);
    assert.equal(parsed["@graph"][0]["@type"], "WebApplication");
    assert.equal(parsed["@graph"][2]["@type"], "FAQPage");
    assert.equal(parsed["@graph"][2].mainEntity.length, 3);
  }

  // 4. PWA manifest share_target + SW POST share-target interception
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.action, "./?share-target=1");

  const storedCache = new Map();
  const events = {};
  vm.runInNewContext(
    await readFile(new URL("../sw.js", import.meta.url), "utf8"),
    {
      URL,
      Response,
      Headers,
      Promise,
      Date,
      JSON,
      self: {
        location: { href: "https://example.test/app/tinylab/sw.js" },
        addEventListener: (name, fn) => (events[name] = fn),
        skipWaiting() {},
        clients: { claim: async () => {} },
      },
      caches: {
        open: async () => ({
          put: async (k, v) => storedCache.set(k, v),
        }),
      },
    },
  );
  const fd = new FormData();
  fd.append(
    "files",
    new File(["%PDF-1.4"], "compartilhado.pdf", { type: "application/pdf" }),
  );
  let shareResponsePromise;
  events.fetch({
    request: {
      method: "POST",
      url: "https://example.test/app/tinylab/?share-target=1",
      headers: new Headers(),
      formData: async () => fd,
    },
    respondWith: (p) => (shareResponsePromise = p),
  });
  assert.ok(shareResponsePromise);
  const res = await shareResponsePromise;
  assert.equal(res.status, 303);
  assert.equal(
    res.headers.get("location"),
    "https://example.test/app/tinylab/?shared=1",
  );
  const metaJson = await storedCache
    .get("https://example.test/app/tinylab/__shared_meta__")
    .json();
  assert.equal(metaJson.files.length, 1);
  assert.equal(metaJson.files[0].name, "compartilhado.pdf");
});

test("Etapa 5 tools: PDF to PPTX, Edit PDF text, Grayscale PDF, Compare PDF, EPUB <-> PDF, PSD/TIFF/ICO decode, Palette, Colorize, TTS WAV and Media commands", async () => {
  const { default: JSZip } = await import("jszip");

  // 1. Create sample PDFs
  const [pdfA] = await pdf("text-to-pdf", [], {
    content: "Relatorio Alpha\nValor antigo: 100\nLinha comum",
    fontSize: 12,
  });
  const [pdfB] = await pdf("text-to-pdf", [], {
    content: "Relatorio Beta\nValor novo: 250\nLinha comum",
    fontSize: 12,
  });
  const fileA = new File([pdfA.blob], "alpha.pdf", { type: "application/pdf" });
  const fileB = new File([pdfB.blob], "beta.pdf", { type: "application/pdf" });

  // 2. PDF -> PPTX (text mode in Node without OffscreenCanvas raster requirement)
  const [pptxOut] = await pdf("pdf-to-pptx", [fileA], { mode: "text" });
  assert.ok(pptxOut.name.endsWith(".pptx"));
  const pptxZip = await JSZip.loadAsync(await pptxOut.blob.arrayBuffer());
  assert.ok(pptxZip.file("ppt/presentation.xml"));
  assert.ok(pptxZip.file("ppt/slides/slide1.xml"));
  const slideXml = await pptxZip.file("ppt/slides/slide1.xml").async("string");
  assert.ok(slideXml.includes("Relatorio Alpha"));

  // 3. Edit PDF text (find & replace)
  const [editedPdf] = await pdf("edit-pdf-text", [fileA], {
    find: "antigo",
    replace: "atualizado",
    pages: "1",
    bgColor: "#ffffff",
    color: "#111111",
  });
  const editedText = (
    await extractText(
      new File([editedPdf.blob], "edited.pdf", { type: "application/pdf" }),
    )
  ).join("\n");
  assert.ok(editedText.includes("atualizado"));

  // 4. Grayscale PDF (smart mode)
  const [grayPdf] = await pdf("grayscale-pdf", [fileA], { mode: "smart" });
  assert.ok(grayPdf.blob.size > 100);
  const grayDoc = await PDFDocument.load(await grayPdf.blob.arrayBuffer());
  assert.equal(grayDoc.getPageCount(), 1);

  // 5. Compare 2 PDFs
  const cmpOutputs = await pdf("compare-pdf", [fileA, fileB], {
    viewMode: "split",
  });
  assert.equal(cmpOutputs.length, 2);
  assert.ok(Array.isArray(cmpOutputs[1].diffRows));
  assert.ok(cmpOutputs[1].diffRows.some((r) => r.type !== "same"));

  // 6. EPUB <-> PDF round-trip
  const [epubOut] = await pdf("epub-pdf", [fileA], {
    title: "Livro Teste",
    author: "4u-Labs",
  });
  assert.ok(epubOut.name.endsWith(".epub"));
  const epubZip = await JSZip.loadAsync(await epubOut.blob.arrayBuffer());
  assert.equal(
    await epubZip.file("mimetype").async("string"),
    "application/epub+zip",
  );
  const epubFile = new File([epubOut.blob], "livro.epub", {
    type: "application/epub+zip",
  });
  const [pdfFromEpub] = await pdf("epub-pdf", [epubFile], { fontSize: 12 });
  assert.ok(pdfFromEpub.name.endsWith(".pdf"));
  const roundText = (
    await extractText(
      new File([pdfFromEpub.blob], "livro.pdf", { type: "application/pdf" }),
    )
  ).join("\n");
  assert.ok(roundText.includes("Relatorio Alpha"));

  // 7. Decode PSD (uncompressed 2x2 RGB), TIFF (uncompressed 2x1 RGB) and ICO (1x1 32-bit BMP)
  const psdBytes = new Uint8Array(26 + 4 + 4 + 4 + 2 + 12);
  const psdDv = new DataView(psdBytes.buffer);
  psdBytes.set([0x38, 0x42, 0x50, 0x53], 0); // 8BPS
  psdDv.setUint16(4, 1, false); // version 1
  psdDv.setUint16(12, 3, false); // 3 channels
  psdDv.setUint32(14, 2, false); // height 2
  psdDv.setUint32(18, 2, false); // width 2
  psdDv.setUint16(22, 8, false); // depth 8
  psdDv.setUint16(24, 3, false); // RGB mode
  // lengths at 26, 30, 34 are 0; compression at 38 = 0 (raw); followed by 4 R, 4 G, 4 B
  psdBytes.set([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0], 40);
  const psdDecoded = decodePsd(psdBytes);
  assert.equal(psdDecoded.width, 2);
  assert.equal(psdDecoded.height, 2);
  assert.equal(psdDecoded.data[0], 255);
  assert.equal(psdDecoded.data[1], 0);

  // Minimal Little-Endian TIFF (2x1 RGB)
  const tiffBytes = new Uint8Array(128);
  const tiffDv = new DataView(tiffBytes.buffer);
  tiffBytes.set([0x49, 0x49, 42, 0], 0);
  tiffDv.setUint32(4, 8, true); // IFD at 8
  tiffDv.setUint16(8, 5, true); // 5 entries
  const writeIfd = (idx, tag, type, count, val) => {
    const off = 10 + idx * 12;
    tiffDv.setUint16(off, tag, true);
    tiffDv.setUint16(off + 2, type, true);
    tiffDv.setUint32(off + 4, count, true);
    tiffDv.setUint32(off + 8, val, true);
  };
  writeIfd(0, 256, 3, 1, 2); // Width = 2
  writeIfd(1, 257, 3, 1, 1); // Height = 1
  writeIfd(2, 259, 3, 1, 1); // Compression = 1
  writeIfd(3, 273, 4, 1, 90); // StripOffsets = 90
  writeIfd(4, 277, 3, 1, 3); // SamplesPerPixel = 3
  tiffBytes.set([10, 20, 30, 40, 50, 60], 90);
  const tiffDecoded = decodeTiff(tiffBytes);
  assert.equal(tiffDecoded.width, 2);
  assert.equal(tiffDecoded.height, 1);
  assert.equal(tiffDecoded.data[0], 10);
  assert.equal(tiffDecoded.data[1], 20);
  assert.equal(tiffDecoded.data[2], 30);

  // Minimal 1x1 32-bit ICO
  const icoBytes = new Uint8Array(22 + 40 + 8);
  const icoDv = new DataView(icoBytes.buffer);
  icoDv.setUint16(2, 1, true);
  icoDv.setUint16(4, 1, true);
  icoBytes[6] = 1;
  icoBytes[7] = 1;
  icoDv.setUint16(12, 32, true);
  icoDv.setUint32(14, 48, true);
  icoDv.setUint32(18, 22, true);
  icoDv.setUint32(22, 40, true); // DIB header size
  icoDv.setInt32(26, 1, true); // width 1
  icoDv.setInt32(30, 2, true); // height*2 = 2
  icoDv.setUint16(34, 1, true);
  icoDv.setUint16(36, 32, true); // 32 bpp
  icoBytes.set([200, 100, 50, 255], 62); // BGRA -> RGBA(50,100,200,255)
  const icoDecoded = decodeIco(icoBytes);
  assert.equal(icoDecoded.width, 1);
  assert.equal(icoDecoded.height, 1);
  assert.equal(icoDecoded.data[0], 50);
  assert.equal(icoDecoded.data[1], 100);
  assert.equal(icoDecoded.data[2], 200);

  // 8. Palette extraction & B&W colorization
  const palData = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 12; i++) palData.set([255, 0, 0, 255], i * 4);
  for (let i = 12; i < 16; i++) palData.set([0, 0, 255, 255], i * 4);
  const pal = extractColorPalette(palData, 4, 4, 2);
  assert.equal(pal.length, 2);
  assert.equal(pal[0].hex, "#ff0000");

  const bwPx = new Uint8ClampedArray([128, 128, 128, 255, 160, 160, 160, 255]);
  colorizeImageData(bwPx, 2, 1, "vintage", 100);
  assert.ok(bwPx[0] > bwPx[2]); // Warm vintage boosts red over blue

  // 9. Text-to-Speech WAV synthesizer & FFmpeg commands
  const wav = synthesizeSpeechWav("TinyLab teste", "female", 1.0);
  assert.equal(
    String.fromCharCode(wav[0], wav[1], wav[2], wav[3]),
    "RIFF",
  );
  assert.equal(
    String.fromCharCode(wav[8], wav[9], wav[10], wav[11]),
    "WAVE",
  );
  assert.ok(wav.byteLength > 8000);

  const revArgs = command(
    "reverse-video",
    { audioMode: "reverse" },
    "in.mp4",
    "out.mp4",
  );
  assert.ok(revArgs.includes("reverse"));
  assert.ok(revArgs.includes("areverse"));

  const denArgs = command(
    "denoise-audio",
    { mode: "denoise", format: "mp3" },
    "in.wav",
    "out.mp3",
  );
  assert.ok(denArgs.some((a) => a.includes("afftdn")));

  const mixArgs = command(
    "add-audio-video",
    { mode: "mix", musicVol: 80, loop: "yes" },
    "in.mp4",
    "out.mp4",
    { audioInput: "bgm.mp3" },
  );
  assert.ok(mixArgs.some((a) => a.includes("amix")));
});

test("Homepage UI integrity: specificIcons, badges, featured tools & Smart Dropzone file recommendations", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSrc = await readFile("src/main.js", "utf8");
  const indexHtml = await readFile("index.html", "utf8");
  const catalogIds = new Set(tools.map((t) => t.id));

  const sliceBlock = (marker, closeToken) => {
    const start = mainSrc.indexOf(marker);
    assert.ok(start >= 0, `Expected marker ${marker} in src/main.js`);
    const end = mainSrc.indexOf(closeToken, start);
    return mainSrc.slice(start, end);
  };
  const grab = (re, s) => [...s.matchAll(re)].map((m) => m[1]);

  // 1. All 150 tools have specific icons and no dead IDs exist in UI maps
  const iconKeys = grab(
    /^\s+"?([a-z0-9-]+)"?:\s*"/gm,
    sliceBlock("const specificIcons = {", "};"),
  );
  assert.equal(iconKeys.length, tools.length);
  for (const t of tools) {
    assert.ok(iconKeys.includes(t.id), `Missing specificIcon for ${t.id}`);
  }

  for (const id of [
    ...grab(
      /"([a-z0-9-]+)"/g,
      sliceBlock("const newToolIds = new Set([", "]);"),
    ),
    ...grab(
      /"([a-z0-9-]+)"/g,
      sliceBlock("const popularToolIds = new Set([", "]);"),
    ),
    ...grab(/"([a-z0-9-]+)"/g, sliceBlock("const featuredToolIds = [", "];")),
    ...grab(/data-tool="([^"]+)"/g, indexHtml),
  ]) {
    assert.ok(catalogIds.has(id), `Unknown tool ID in homepage UI: ${id}`);
  }

  // 2. Smart Dropzone file recommendation & single/multi-file handoff
  const recCode = sliceBlock(
    "function recommendToolsForFiles(incoming) {",
    "function renderHeroDropMatched()",
  );
  const { recommendToolsForFiles, filesForTool } = new Function(
    "findTool",
    "validFiles",
    `${recCode}; return { recommendToolsForFiles, filesForTool };`,
  )((id) => tools.find((t) => t.id === id), validFiles);

  const mkFile = (name, type = "", bytes = 16) =>
    new File([new Uint8Array(bytes)], name, { type });

  const matrix = [
    [["relatorio.pdf", "application/pdf"], "compress-pdf"],
    [
      [
        ["a.pdf", "application/pdf"],
        ["b.pdf", "application/pdf"],
      ],
      "merge-pdf",
    ],
    [["foto.jpg", "image/jpeg"], "ai-remove-bg"],
    [["arte.psd", ""], "pro-image-converter"],
    [["digitalizado.tiff", "image/tiff"], "pro-image-converter"],
    [["iphone.heic", ""], "heic-to-jpg"],
    [["vetor.svg", "image/svg+xml"], "svg-to-png"],
    [["animado.gif", "image/gif"], "gif-to-video"],
    [["aula.mp4", "video/mp4"], "trim-video"],
    [["entrevista.mp3", "audio/mpeg"], "trim-audio"],
    [["ebook.epub", "application/epub+zip"], "epub-pdf"],
    [["planilha.xlsx", ""], "excel-to-pdf"],
    [["tabela.csv", "text/csv"], "csv-to-excel"],
    [["dados.json", "application/json"], "json-to-excel"],
    [["nota.xml", "text/xml"], "xml-to-json"],
    [["slides.pptx", ""], "office-to-pdf"],
    [["contrato.docx", ""], "word-to-pdf"],
    [["pacote.zip", "application/zip"], "extract-zip"],
  ];

  for (const [spec, expectedFirst] of matrix) {
    const incoming = Array.isArray(spec[0])
      ? spec.map(([n, t]) => mkFile(n, t))
      : [mkFile(spec[0], spec[1])];
    const recs = recommendToolsForFiles(incoming);
    assert.ok(recs.length >= 2, `Expected >=2 recommendations for ${spec}`);
    assert.equal(recs[0].id, expectedFirst);
    for (const tool of recs) {
      const handoff = filesForTool(tool, incoming);
      assert.doesNotThrow(() => validFiles(tool, handoff));
      if (!tool.multiple) assert.equal(handoff.length, 1);
    }
  }

  // Empty 0-byte file must return 0 recommendations
  assert.equal(
    recommendToolsForFiles([mkFile("vazio.pdf", "application/pdf", 0)]).length,
    0,
  );
});
