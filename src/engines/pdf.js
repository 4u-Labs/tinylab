import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  setTextRenderingMode,
  TextRenderingMode,
  StandardFonts,
  rgb,
  degrees,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
} from "pdf-lib";
import {
  canvas,
  toBlob,
  bitmap,
  output,
  textOutput,
  pageIndices,
  baseName,
  progress,
  tick,
  check,
  asset,
} from "../utils.js";

let pdfjsPromise, fontBytes;

export async function pdfjs() {
  if (!pdfjsPromise) {
    const isBrowser =
      typeof window !== "undefined" || typeof WorkerGlobalScope !== "undefined";
    const legacySpec = ["pdfjs-dist", "legacy", "build", "pdf.mjs"].join("/");
    pdfjsPromise = (
      isBrowser
        ? import("pdfjs-dist/build/pdf.mjs")
        : Function("s", "return import(s)")(legacySpec)
    ).then((m) => {
      const p = m.default || m;
      if (isBrowser) p.GlobalWorkerOptions.workerSrc = asset("pdf.worker.min.mjs");
      return p;
    });
  }
  return pdfjsPromise;
}

export async function loadView(file) {
  const p = await pdfjs();
  const isBrowser =
    typeof window !== "undefined" || typeof WorkerGlobalScope !== "undefined";
  return p.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    ...(isBrowser
      ? {
          cMapUrl: asset("cmaps/"),
          cMapPacked: true,
          standardFontDataUrl: asset("standard_fonts/"),
        }
      : { disableWorker: true }),
    isEvalSupported: false,
  }).promise;
}

export async function renderPage(doc, index, scale = 1) {
  const page = await doc.getPage(index + 1),
    viewport = page.getViewport({ scale });
  const c = canvas(viewport.width, viewport.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport }).promise;
  return c;
}

export async function extractText(file, ctx = {}) {
  const doc = await loadView(file);
  try {
    const pages = [];
    for (let i = 0; i < doc.numPages; i++) {
      const content = await (await doc.getPage(i + 1)).getTextContent();
      let s = "";
      for (const item of content.items)
        s += item.str + (item.hasEOL ? "\n" : " ");
      pages.push(s.trim());
      progress(ctx, ((i + 1) / doc.numPages) * 80);
      await tick();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

export async function embedFont(doc) {
  try {
    const { default: fontkit } = await import("@pdf-lib/fontkit");
    doc.registerFontkit(fontkit);
    if (!fontBytes)
      fontBytes = fetch(asset("DejaVuSans.ttf")).then((r) => {
        if (!r.ok) throw new Error("Fonte indisponível / Font unavailable.");
        return r.arrayBuffer();
      });
    return await doc.embedFont(await fontBytes, { subset: true });
  } catch (e) {
    fontBytes = null;
    if (
      typeof window === "undefined" &&
      typeof WorkerGlobalScope === "undefined"
    ) {
      return doc.embedFont(StandardFonts.Helvetica);
    }
    throw e;
  }
}

function sanitizeForFont(s, allowed) {
  return Array.from(String(s || ""))
    .map((c) =>
      c === "\n" || c === "\t" || allowed.has(c.codePointAt(0)) ? c : "?",
    )
    .join("")
    .replace(/\t/g, "    ");
}

function wrapText(s, font, size, maxWidth) {
  const out = [];
  for (const rawLine of String(s).split("\n")) {
    const words = rawLine.split(" ");
    let line = "";
    const pushLine = () => {
      out.push(line);
      line = "";
    };
    for (let word of words) {
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        if (line) pushLine();
        let cut = 1;
        while (
          cut < word.length &&
          font.widthOfTextAtSize(word.slice(0, cut + 1), size) <= maxWidth
        )
          cut++;
        line = word.slice(0, cut);
        pushLine();
        word = word.slice(cut);
      }
      if (
        line &&
        font.widthOfTextAtSize(line + " " + word, size) > maxWidth
      ) {
        pushLine();
      }
      line += (line ? " " : "") + word;
    }
    pushLine();
  }
  return out;
}

export async function textPDF(s) {
  const doc = await PDFDocument.create(),
    font = await embedFont(doc),
    allowed = new Set(font.getCharacterSet());
  let page, y;
  const add = () => {
    page = doc.addPage([595.28, 841.89]);
    y = 793;
  };
  add();
  const lines = wrapText(sanitizeForFont(s, allowed), font, 10, 515);
  for (const line of lines) {
    if (y < 48) add();
    if (line) page.drawText(line, { x: 40, y, size: 10, font });
    y -= 15;
  }
  return new Blob([await doc.save({ useObjectStreams: true })], {
    type: "application/pdf",
  });
}

export async function formSchema(file) {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  return doc
    .getForm()
    .getFields()
    .map((f) => ({
      name: f.getName(),
      type:
        f instanceof PDFCheckBox
          ? "checkbox"
          : f instanceof PDFDropdown ||
              f instanceof PDFOptionList ||
              f instanceof PDFRadioGroup
            ? "select"
            : "text",
      options: f.getOptions?.() || [],
      value: f.getText?.() ?? f.getSelected?.() ?? f.isChecked?.() ?? "",
    }));
}

async function extractPageImages(doc, pageIndex) {
  const hasCanvas =
    typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined";
  if (!hasCanvas) return [];
  const p = await pdfjs(),
    page = await doc.getPage(pageIndex + 1),
    ops = await page.getOperatorList();
  const images = [],
    seen = new Set();
  for (let j = 0; j < ops.fnArray.length; j++) {
    const fn = ops.fnArray[j];
    if (
      fn !== p.OPS.paintImageXObject &&
      fn !== p.OPS.paintInlineImageXObject
    )
      continue;
    const key = ops.argsArray[j][0];
    if (typeof key === "string" && seen.has(key)) continue;
    seen.add(key);
    const image =
      typeof key === "string"
        ? await new Promise((r) => page.objs.get(key, r))
        : key;
    if (!image?.width || !image?.height) continue;
    const c = canvas(image.width, image.height),
      g = c.getContext("2d");
    if (image.bitmap) g.drawImage(image.bitmap, 0, 0);
    else if (image.data) {
      const d = g.createImageData(image.width, image.height),
        src = image.data;
      if (image.kind === p.ImageKind.RGBA_32BPP) d.data.set(src);
      else if (image.kind === p.ImageKind.RGB_24BPP) {
        for (let a = 0, b = 0; a < src.length; a += 3, b += 4) {
          d.data[b] = src[a];
          d.data[b + 1] = src[a + 1];
          d.data[b + 2] = src[a + 2];
          d.data[b + 3] = 255;
        }
      } else {
        for (let a = 0; a < image.width * image.height; a++) {
          const bit = (src[Math.floor(a / 8)] >> (7 - (a % 8))) & 1;
          d.data.set([bit * 255, bit * 255, bit * 255, 255], a * 4);
        }
      }
      g.putImageData(d, 0, 0);
    } else continue;
    images.push({
      blob: await toBlob(c),
      width: image.width,
      height: image.height,
    });
  }
  return images;
}

function extractOcrWords(data) {
  if (Array.isArray(data?.words) && data.words.length) return data.words;
  const words = [];
  for (const block of data?.blocks || [])
    for (const para of block.paragraphs || [])
      for (const line of para.lines || [])
        for (const word of line.words || []) words.push(word);
  return words;
}

export async function recompressPdfImages(doc, o = {}, ctx = {}) {
  const hasCanvas =
    Boolean(ctx.encodeJpeg) ||
    typeof document !== "undefined" ||
    typeof OffscreenCanvas !== "undefined";
  if (!hasCanvas) return 0;
  const quality = Math.max(
    0.1,
    Math.min(0.95, Number(o.quality || 80) / 100),
  );
  const maxDim = Math.max(400, Math.round(1200 * Number(o.scale || 1.5)));
  const entries = doc.context.enumerateIndirectObjects();
  let replaced = 0;
  for (let idx = 0; idx < entries.length; idx++) {
    check(ctx);
    const [ref, obj] = entries[idx];
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    if (
      dict.has(PDFName.of("SMask")) ||
      dict.has(PDFName.of("Mask")) ||
      dict.has(PDFName.of("ImageMask"))
    )
      continue;
    const iw = dict.lookup(PDFName.of("Width"))?.asNumber?.() || 0,
      ih = dict.lookup(PDFName.of("Height"))?.asNumber?.() || 0,
      bpc = dict.lookup(PDFName.of("BitsPerComponent"))?.asNumber?.() ?? 8,
      cs = dict.lookup(PDFName.of("ColorSpace"))?.toString?.() || "",
      filter = dict.lookup(PDFName.of("Filter"))?.toString?.() || "";
    if (iw < 32 || ih < 32 || bpc !== 8) continue;
    if (cs !== "/DeviceRGB" && cs !== "/DeviceGray") continue;
    const scale = Math.min(1, maxDim / Math.max(iw, ih));
    const tw = Math.max(1, Math.round(iw * scale)),
      th = Math.max(1, Math.round(ih * scale));
    let jpgBytes = null;
    try {
      if (ctx.encodeJpeg) {
        const raw = filter.includes("DCTDecode")
          ? obj.contents
          : decodePDFRawStream(obj).decode();
        jpgBytes = await ctx.encodeJpeg({
          raw,
          iw,
          ih,
          tw,
          th,
          cs,
          filter,
          quality,
        });
      } else if (filter.includes("DCTDecode")) {
        const img = await bitmap(
          new Blob([obj.contents], { type: "image/jpeg" }),
        );
        try {
          const c = canvas(tw, th),
            g = c.getContext("2d");
          g.fillStyle = "#fff";
          g.fillRect(0, 0, tw, th);
          g.drawImage(img, 0, 0, tw, th);
          jpgBytes = new Uint8Array(
            await (await toBlob(c, "image/jpeg", quality)).arrayBuffer(),
          );
        } finally {
          img.close?.();
        }
      } else {
        const decoded = decodePDFRawStream(obj).decode();
        const channels = cs === "/DeviceGray" ? 1 : 3;
        if (decoded.length < iw * ih * channels) continue;
        const srcCanvas = canvas(iw, ih),
          sg = srcCanvas.getContext("2d"),
          imgData = sg.createImageData(iw, ih);
        if (channels === 3) {
          for (let p = 0, s = 0; p < iw * ih * 4; p += 4, s += 3) {
            imgData.data[p] = decoded[s];
            imgData.data[p + 1] = decoded[s + 1];
            imgData.data[p + 2] = decoded[s + 2];
            imgData.data[p + 3] = 255;
          }
        } else {
          for (let p = 0, s = 0; p < iw * ih * 4; p += 4, s++) {
            const v = decoded[s];
            imgData.data[p] = v;
            imgData.data[p + 1] = v;
            imgData.data[p + 2] = v;
            imgData.data[p + 3] = 255;
          }
        }
        sg.putImageData(imgData, 0, 0);
        let outCanvas = srcCanvas;
        if (tw !== iw || th !== ih) {
          outCanvas = canvas(tw, th);
          outCanvas.getContext("2d").drawImage(srcCanvas, 0, 0, tw, th);
        }
        jpgBytes = new Uint8Array(
          await (await toBlob(outCanvas, "image/jpeg", quality)).arrayBuffer(),
        );
      }
    } catch {
      continue;
    }
    if (jpgBytes && jpgBytes.length < obj.contents.length * 0.95) {
      const nextDict = dict.clone(doc.context);
      nextDict.set(PDFName.of("Width"), doc.context.obj(tw));
      nextDict.set(PDFName.of("Height"), doc.context.obj(th));
      nextDict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
      nextDict.set(PDFName.of("BitsPerComponent"), doc.context.obj(8));
      nextDict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      nextDict.delete(PDFName.of("DecodeParms"));
      nextDict.set(PDFName.of("Length"), doc.context.obj(jpgBytes.length));
      doc.context.assign(ref, PDFRawStream.of(nextDict, jpgBytes));
      replaced++;
    }
    progress(ctx, ((idx + 1) / entries.length) * 90);
    await tick();
  }
  return replaced;
}

async function pdfToStructuredWord(file, name, ctx) {
  const doc = await loadView(file);
  try {
    const pageModels = [];
    const allSizes = [];
    for (let i = 0; i < doc.numPages; i++) {
      check(ctx);
      const page = await doc.getPage(i + 1),
        content = await page.getTextContent();
      const items = [];
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        const tr = it.transform || [11, 0, 0, 11, 0, 0];
        const size = Math.max(
          6,
          Math.hypot(tr[2], tr[3]) || Math.abs(tr[0]) || 11,
        );
        const fontFamily = content.styles?.[it.fontName]?.fontFamily || "";
        items.push({
          str: it.str,
          x: tr[4] || 0,
          y: tr[5] || 0,
          w: it.width || it.str.length * size * 0.5,
          size,
          bold:
            /bold|black|heavy|semibold|demi/i.test(it.fontName || "") ||
            /bold/i.test(fontFamily),
          italic:
            /italic|oblique/i.test(it.fontName || "") ||
            /italic/i.test(fontFamily),
        });
        allSizes.push(size);
      }
      items.sort((a, b) =>
        Math.abs(b.y - a.y) > Math.min(a.size, b.size) * 0.45
          ? b.y - a.y
          : a.x - b.x,
      );
      const lines = [];
      for (const it of items) {
        const last = lines.at(-1);
        if (
          last &&
          Math.abs(last.y - it.y) <= Math.min(last.maxSize, it.size) * 0.45
        ) {
          last.items.push(it);
          last.maxSize = Math.max(last.maxSize, it.size);
        } else {
          lines.push({ y: it.y, maxSize: it.size, items: [it] });
        }
      }
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        const cells = [];
        for (const it of l.items) {
          const prev = cells.at(-1);
          if (prev && it.x - prev.endX <= Math.max(18, l.maxSize * 1.6)) {
            const needSpace =
              it.x - prev.endX > l.maxSize * 0.18 &&
              !prev.text.endsWith(" ") &&
              !it.str.startsWith(" ");
            prev.text += (needSpace ? " " : "") + it.str;
            prev.endX = Math.max(prev.endX, it.x + it.w);
            prev.bold = prev.bold || it.bold;
            prev.italic = prev.italic || it.italic;
          } else {
            cells.push({
              x: it.x,
              endX: it.x + it.w,
              text: it.str.trim(),
              bold: it.bold,
              italic: it.italic,
            });
          }
        }
        l.cells = cells.filter((c) => c.text);
      }
      const images = await extractPageImages(doc, i);
      pageModels.push({ lines: lines.filter((l) => l.cells.length), images });
      progress(ctx, ((i + 1) / doc.numPages) * 85);
      await tick();
    }
    if (!allSizes.length)
      throw new Error(
        "PDF sem texto selecionável. Use OCR de PDF / No selectable text. Use PDF OCR.",
      );
    allSizes.sort((a, b) => a - b);
    const bodySize = allSizes[Math.floor(allSizes.length / 2)] || 11;
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      HeadingLevel,
      PageBreak,
      Table,
      TableRow,
      TableCell,
      WidthType,
      ImageRun,
    } = await import("docx");
    const children = [];
    for (let pIdx = 0; pIdx < pageModels.length; pIdx++) {
      if (pIdx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      const { lines, images } = pageModels[pIdx];
      let idx = 0;
      while (idx < lines.length) {
        const line = lines[idx];
        // Detect multi-column table block (2+ consecutive rows with >= 2 separated cells)
        if (
          line.cells.length >= 2 &&
          idx + 1 < lines.length &&
          lines[idx + 1].cells.length === line.cells.length
        ) {
          const tableLines = [line];
          const cols = line.cells.length;
          idx++;
          while (idx < lines.length && lines[idx].cells.length === cols) {
            tableLines.push(lines[idx++]);
          }
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableLines.map(
                (r, rIdx) =>
                  new TableRow({
                    children: r.cells.map(
                      (c) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: c.text,
                                  bold: c.bold || rIdx === 0,
                                  italics: c.italic,
                                }),
                              ],
                            }),
                          ],
                        }),
                    ),
                  }),
              ),
            }),
          );
          continue;
        }
        const textLine = line.cells.map((c) => c.text).join("  ");
        const isH1 = line.maxSize >= bodySize * 1.42;
        const isH2 = !isH1 && line.maxSize >= bodySize * 1.18;
        const isBullet = /^([•\-–*]|\d+[.)])\s+/.test(textLine);
        if (isH1 || isH2 || isBullet) {
          children.push(
            new Paragraph({
              heading: isH1
                ? HeadingLevel.HEADING_1
                : isH2
                  ? HeadingLevel.HEADING_2
                  : undefined,
              children: [
                new TextRun({
                  text: textLine,
                  bold: isH1 || isH2 || line.cells.every((c) => c.bold),
                  italics: line.cells.every((c) => c.italic),
                }),
              ],
            }),
          );
          idx++;
          continue;
        }
        // Merge wrapped body lines into a single paragraph
        const runs = [];
        let cur = line;
        idx++;
        while (true) {
          runs.push(
            new TextRun({
              text:
                cur.cells.map((c) => c.text).join(" ") +
                (idx < lines.length ? " " : ""),
              bold: cur.cells.every((c) => c.bold),
              italics: cur.cells.every((c) => c.italic),
            }),
          );
          const next = lines[idx];
          if (
            !next ||
            next.cells.length > 1 ||
            next.maxSize >= bodySize * 1.18 ||
            /^([•\-–*]|\d+[.)])\s+/.test(next.cells[0]?.text || "") ||
            cur.y - next.y > cur.maxSize * 1.9
          )
            break;
          cur = next;
          idx++;
        }
        children.push(new Paragraph({ children: runs }));
      }
      for (const im of images) {
        const scale = Math.min(480 / im.width, 560 / im.height, 1);
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: new Uint8Array(await im.blob.arrayBuffer()),
                transformation: {
                  width: Math.max(16, Math.round(im.width * scale)),
                  height: Math.max(16, Math.round(im.height * scale)),
                },
                type: "png",
              }),
            ],
          }),
        );
      }
    }
    return [
      output(
        await Packer.toBlob(new Document({ sections: [{ children }] })),
        `${name}.docx`,
      ),
    ];
  } finally {
    await doc.destroy();
  }
}

async function wordHtmlToPdf(htmlString) {
  const doc = await PDFDocument.create(),
    font = await embedFont(doc),
    allowed = new Set(font.getCharacterSet());
  const W = 595.28,
    H = 841.89,
    M = 44,
    MAXW = W - M * 2;
  let page, y;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  newPage();
  const ensure = (need) => {
    if (y - need < M) newPage();
  };

  async function drawDataImage(src) {
    if (!/^data:image\/(png|jpe?g);base64,/i.test(src)) return;
    const bytes = Uint8Array.from(atob(src.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const img = /^data:image\/png/i.test(src)
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
    const scale = Math.min(MAXW / img.width, 460 / img.height, 1);
    const dw = img.width * scale,
      dh = img.height * scale;
    ensure(dh + 14);
    page.drawImage(img, { x: M, y: y - dh, width: dw, height: dh });
    y -= dh + 14;
  }

  function drawParagraphText(raw, { size = 10.5, indent = 0, color = rgb(0.1, 0.1, 0.14), gapAfter = 7 } = {}) {
    const clean = sanitizeForFont(raw, allowed).trim();
    if (!clean) return;
    const lines = wrapText(clean, font, size, MAXW - indent);
    const lh = size * 1.42;
    for (const line of lines) {
      ensure(lh);
      if (line) page.drawText(line, { x: M + indent, y: y - size, size, font, color });
      y -= lh;
    }
    y -= gapAfter;
  }

  if (typeof DOMParser === "undefined") {
    const plain = String(htmlString)
      .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    drawParagraphText(plain);
    return doc;
  }

  const dom = new DOMParser().parseFromString(htmlString, "text/html");
  async function walkBlock(el) {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;
    if (tag === "img") {
      await drawDataImage(el.src);
      return;
    }
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      y -= 4;
      drawParagraphText(el.textContent, {
        size: tag === "h1" ? 18 : tag === "h2" ? 14 : tag === "h3" ? 12 : 11,
        color: rgb(0.14, 0.08, 0.28),
        gapAfter: 8,
      });
      return;
    }
    if (tag === "hr") {
      ensure(14);
      page.drawLine({
        start: { x: M, y: y - 4 },
        end: { x: W - M, y: y - 4 },
        thickness: 0.7,
        color: rgb(0.78, 0.77, 0.84),
      });
      y -= 12;
      return;
    }
    if (tag === "pre") {
      const mono = await doc.embedFont(StandardFonts.Courier);
      const monoAllowed = new Set(mono.getCharacterSet());
      const rawLines = sanitizeForFont(el.textContent || "", monoAllowed).split("\n");
      const wrappedCode = rawLines.flatMap((ln) =>
        wrapText(ln, mono, 8.8, MAXW - 18),
      );
      const boxH = Math.max(20, wrappedCode.length * 12 + 12);
      ensure(boxH + 8);
      page.drawRectangle({
        x: M,
        y: y - boxH,
        width: MAXW,
        height: boxH,
        color: rgb(0.95, 0.95, 0.97),
        borderColor: rgb(0.84, 0.83, 0.89),
        borderWidth: 0.5,
      });
      wrappedCode.forEach((ln, idx) => {
        if (ln)
          page.drawText(ln, {
            x: M + 9,
            y: y - 14 - idx * 12,
            size: 8.8,
            font: mono,
            color: rgb(0.16, 0.14, 0.22),
          });
      });
      y -= boxH + 8;
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items = [...el.querySelectorAll(":scope > li")];
      items.forEach((li, idx) => {
        const prefix = tag === "ol" ? `${idx + 1}. ` : "• ";
        drawParagraphText(prefix + li.textContent.trim(), {
          size: 10.5,
          indent: 14,
          gapAfter: 4,
        });
      });
      y -= 4;
      return;
    }
    if (tag === "table") {
      const rows = [...el.querySelectorAll("tr")];
      if (!rows.length) return;
      const colCount = Math.max(
        1,
        ...rows.map((r) => r.querySelectorAll("th,td").length),
      );
      const colW = MAXW / colCount,
        cellSize = 9.2,
        pad = 5;
      rows.forEach((r, rIdx) => {
        const cells = [...r.querySelectorAll("th,td")];
        const wrapped = Array.from({ length: colCount }, (_, cIdx) =>
          wrapText(
            sanitizeForFont(cells[cIdx]?.textContent || "", allowed).trim(),
            font,
            cellSize,
            Math.max(24, colW - pad * 2),
          ),
        );
        const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
        const rowH = maxLines * (cellSize * 1.35) + pad * 2;
        ensure(rowH + 4);
        const topY = y;
        for (let cIdx = 0; cIdx < colCount; cIdx++) {
          const cx = M + cIdx * colW;
          page.drawRectangle({
            x: cx,
            y: topY - rowH,
            width: colW,
            height: rowH,
            color:
              rIdx === 0 || cells[cIdx]?.tagName?.toLowerCase() === "th"
                ? rgb(0.94, 0.93, 0.97)
                : undefined,
            borderColor: rgb(0.78, 0.77, 0.84),
            borderWidth: 0.6,
          });
          wrapped[cIdx].forEach((ln, lIdx) => {
            if (ln)
              page.drawText(ln, {
                x: cx + pad,
                y: topY - pad - cellSize - lIdx * (cellSize * 1.35),
                size: cellSize,
                font,
                color: rgb(0.1, 0.1, 0.14),
              });
          });
        }
        y -= rowH;
      });
      y -= 10;
      return;
    }
    const imgs = [...el.querySelectorAll("img")];
    if (el.textContent?.trim()) {
      drawParagraphText(el.textContent, {
        size: tag === "blockquote" ? 10 : 10.5,
        indent: tag === "blockquote" ? 16 : 0,
      });
    }
    for (const im of imgs) await drawDataImage(im.src);
  }

  for (const child of dom.body.children) await walkBlock(child);
  if (!dom.body.children.length && dom.body.textContent?.trim()) {
    drawParagraphText(dom.body.textContent);
  }
  return doc;
}

export async function readPdfMetadata(file) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), {
    updateMetadata: false,
  });
  return {
    title: doc.getTitle() || "",
    author: doc.getAuthor() || "",
    subject: doc.getSubject() || "",
    keywords: doc.getKeywords() || "",
    creator: doc.getCreator() || "",
    producer: doc.getProducer() || "",
    pages: doc.getPageCount(),
  };
}

export async function findTermRedactionBoxes(file, rawTerms) {
  const terms = String(rawTerms || "")
    .split(/[,\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!terms.length) return new Map();
  const doc = await loadView(file);
  const byPage = new Map();
  try {
    for (let i = 0; i < doc.numPages; i++) {
      const page = await doc.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const boxes = [];
      for (const item of content.items) {
        const str = String(item.str || "");
        if (!str.trim()) continue;
        const lower = str.toLowerCase();
        if (terms.some((term) => lower.includes(term))) {
          const tx = item.transform?.[4] ?? 0;
          const ty = item.transform?.[5] ?? 0;
          const fs = Math.max(8, Math.hypot(item.transform?.[0] || 11, item.transform?.[1] || 0));
          const iw = Math.max(fs * 0.6, Number(item.width) || str.length * fs * 0.55);
          const ih = Math.max(fs * 1.25, Number(item.height) || fs * 1.2);
          const pad = 2;
          const x = Math.max(0, (tx - pad) / vp.width);
          const topY = Math.max(0, (vp.height - ty - ih * 0.88 - pad) / vp.height);
          const w = Math.min(1 - x, (iw + pad * 2) / vp.width);
          const h = Math.min(1 - topY, (ih + pad * 2) / vp.height);
          boxes.push({ x, y: topY, w, h });
        }
      }
      if (boxes.length) byPage.set(i, boxes);
    }
  } finally {
    await doc.destroy();
  }
  return byPage;
}

async function pdfToExcel(file, name, o, ctx) {
  const XLSX = await import("xlsx");
  const doc = await loadView(file);
  try {
    const indices = pageIndices(o.pages, doc.numPages);
    const wb = XLSX.utils.book_new();
    let totalCells = 0;
    for (let k = 0; k < indices.length; k++) {
      check(ctx);
      const pIdx = indices[k];
      const page = await doc.getPage(pIdx + 1);
      const content = await page.getTextContent();
      const rawItems = content.items
        .filter((it) => String(it.str || "").trim())
        .map((it) => {
          const fs = Math.max(
            6,
            Math.hypot(it.transform?.[0] || 10, it.transform?.[1] || 0),
          );
          return {
            str: String(it.str).trim(),
            x: it.transform?.[4] ?? 0,
            y: it.transform?.[5] ?? 0,
            w: Math.max(fs * 0.5, Number(it.width) || it.str.length * fs * 0.5),
            fs,
          };
        });
      if (!rawItems.length) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([[""]]),
          `Pag_${pIdx + 1}`,
        );
        continue;
      }
      const sizes = rawItems.map((r) => r.fs).sort((a, b) => a - b);
      const medFs = sizes[Math.floor(sizes.length / 2)] || 10;
      rawItems.sort((a, b) => (Math.abs(b.y - a.y) > medFs * 0.48 ? b.y - a.y : a.x - b.x));
      const lineGroups = [];
      for (const it of rawItems) {
        const last = lineGroups.at(-1);
        if (last && Math.abs(last.y - it.y) <= medFs * 0.48) {
          last.items.push(it);
        } else {
          lineGroups.push({ y: it.y, items: [it] });
        }
      }
      const segmentedRows = lineGroups.map((lg) => {
        lg.items.sort((a, b) => a.x - b.x);
        const cells = [];
        for (const it of lg.items) {
          const prev = cells.at(-1);
          if (prev && it.x - prev.endX <= medFs * 1.15) {
            prev.text += " " + it.str;
            prev.endX = Math.max(prev.endX, it.x + it.w);
          } else {
            cells.push({ x: it.x, endX: it.x + it.w, text: it.str });
          }
        }
        return cells;
      });
      const anchors = [];
      for (const row of segmentedRows) {
        if (row.length < 2) continue;
        for (const cell of row) {
          const hit = anchors.find((a) => Math.abs(a.x - cell.x) <= medFs * 2.2);
          if (hit) {
            hit.x = (hit.x * hit.n + cell.x) / (hit.n + 1);
            hit.n++;
          } else {
            anchors.push({ x: cell.x, n: 1 });
          }
        }
      }
      anchors.sort((a, b) => a.x - b.x);
      const aoa = segmentedRows.map((row) => {
        if (!anchors.length) return row.map((c) => c.text);
        const cols = Array(anchors.length).fill("");
        for (const cell of row) {
          let bestIdx = 0,
            bestDist = Infinity;
          anchors.forEach((a, idx) => {
            const d = Math.abs(a.x - cell.x);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = idx;
            }
          });
          cols[bestIdx] = cols[bestIdx]
            ? `${cols[bestIdx]} ${cell.text}`
            : cell.text;
          totalCells++;
        }
        return cols;
      });
      if (!anchors.length) totalCells += aoa.reduce((s, r) => s + r.length, 0);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(aoa),
        `Pag_${pIdx + 1}`,
      );
      progress(ctx, ((k + 1) / indices.length) * 90);
      await tick();
    }
    if (!totalCells)
      throw new Error(
        "Nenhum texto selecionável encontrado. Use OCR de PDF primeiro / No selectable text found. Run PDF OCR first.",
      );
    const outs = [];
    const fmt = o.format || "xlsx";
    if (fmt === "xlsx" || fmt === "both") {
      outs.push(
        output(
          new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `${name}.xlsx`,
        ),
      );
    }
    if (fmt === "csv" || fmt === "both") {
      const csvParts = wb.SheetNames.map((sn) =>
        XLSX.utils.sheet_to_csv(wb.Sheets[sn]),
      ).join("\n\n");
      outs.push(
        textOutput(
          "\uFEFF" + csvParts,
          `${name}.csv`,
          "text/csv;charset=utf-8",
        ),
      );
    }
    return outs;
  } finally {
    await doc.destroy();
  }
}

const xmlEsc = (s) =>
  String(s ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );

async function pdfToPptx(file, name, o, ctx) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const doc = await loadView(file);
  const canRenderCanvas =
    typeof OffscreenCanvas !== "undefined" ||
    typeof HTMLCanvasElement !== "undefined";
  try {
    const numPages = doc.numPages;
    const slideEntries = [];
    const slideRels = [];
    const contentOverrideSlides = [];

    for (let i = 0; i < numPages; i++) {
      check(ctx);
      const slideNum = i + 1;
      const page = await doc.getPage(slideNum);
      const tc = await page.getTextContent();
      const lines = [];
      for (const it of tc.items) {
        const str = (it.str || "").trim();
        if (!str) continue;
        const y = Math.round((it.transform?.[5] || 0) / 4) * 4;
        const prev = lines.at(-1);
        if (prev && Math.abs(prev.y - y) <= 6) {
          prev.text += " " + str;
        } else {
          lines.push({ y, text: str });
        }
      }
      const titleLine =
        lines[0]?.text?.slice(0, 120) || `${name} — Slide ${slideNum}`;
      const bodyLines = lines.slice(1, 24).map((l) => l.text);

      let hasImage = false;
      if (o.mode !== "text" && canRenderCanvas) {
        try {
          const c = await renderPage(doc, i, 1.5);
          const pngBlob = await toBlob(c, "image/png");
          zip.file(
            `ppt/media/slide-${slideNum}.png`,
            await pngBlob.arrayBuffer(),
          );
          hasImage = true;
        } catch {}
      }

      const picXml = hasImage
        ? `<p:pic>
            <p:nvPicPr>
              <p:cNvPr id="10" name="PageImage ${slideNum}"/>
              <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
              <p:nvPr/>
            </p:nvPicPr>
            <p:blipFill>
              <a:blip r:embed="rId2"/>
              <a:stretch><a:fillRect/></a:stretch>
            </p:blipFill>
            <p:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="6858000"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </p:spPr>
          </p:pic>`
        : "";

      const parasXml = (bodyLines.length ? bodyLines : [titleLine])
        .map(
          (ln) =>
            `<a:p><a:r><a:rPr lang="pt-BR" sz="${hasImage ? "1200" : "1800"}" dirty="0"/><a:t>${xmlEsc(ln)}</a:t></a:r></a:p>`,
        )
        .join("");

      const textShapeXml = `<p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title ${slideNum}"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="${hasImage ? "5900000" : "457200"}"/>
            <a:ext cx="8229600" cy="${hasImage ? "800000" : "5800000"}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          ${hasImage ? '<a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="85000"/></a:srgbClr></a:solidFill>' : "<a:noFill/>"}
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
          <a:p><a:r><a:rPr lang="pt-BR" sz="${hasImage ? "1400" : "2600"}" b="1" dirty="0"/><a:t>${xmlEsc(titleLine)}</a:t></a:r></a:p>
          ${hasImage ? "" : parasXml}
        </p:txBody>
      </p:sp>`;

      zip.file(
        `ppt/slides/slide${slideNum}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${picXml}
      ${textShapeXml}
    </p:spTree>
  </p:cSld>
</p:sld>`,
      );

      zip.file(
        `ppt/slides/_rels/slide${slideNum}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  ${hasImage ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slide-${slideNum}.png"/>` : ""}
</Relationships>`,
      );

      slideEntries.push(
        `<p:sldId id="${255 + slideNum}" r:id="rId${slideNum + 1}"/>`,
      );
      slideRels.push(
        `<Relationship Id="rId${slideNum + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`,
      );
      contentOverrideSlides.push(
        `<Override PartName="/ppt/slides/slide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      );
      progress(ctx, ((i + 1) / numPages) * 92);
      await tick();
    }

    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  ${contentOverrideSlides.join("\n  ")}
</Types>`,
    );

    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
    );

    zip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideEntries.join("")}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
    );

    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels.join("\n  ")}
</Relationships>`,
    );

    zip.file(
      "ppt/slideMasters/slideMaster1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`,
    );

    zip.file(
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
    );

    zip.file(
      "ppt/slideLayouts/slideLayout1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
</p:sldLayout>`,
    );

    zip.file(
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
    );

    const pptxBlob = await zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      compression: "DEFLATE",
    });
    return [output(pptxBlob, `${name}.pptx`)];
  } finally {
    await doc.destroy();
  }
}

async function epubPdf(file, name, o, ctx) {
  const { default: JSZip } = await import("jszip");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf =
    /\.pdf$/i.test(file.name || "") ||
    (bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46);

  if (isPdf) {
    const pages = await extractText(file, ctx);
    const nonEmpty = pages.filter((p) => p.trim());
    if (!nonEmpty.length)
      throw new Error(
        "PDF sem texto selecionável. Use OCR de PDF primeiro / No selectable text in PDF. Run PDF OCR first.",
      );
    const bookTitle = String(o.title || name || "Livro TinyLab").trim();
    const bookAuthor = String(o.author || "TinyLab · 4u-Labs").trim();
    const uid = `urn:uuid:tinylab-${Date.now()}`;
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );
    zip.file(
      "OEBPS/style.css",
      `body { font-family: serif; line-height: 1.65; margin: 1.2em; color: #111; } h1, h2 { font-family: sans-serif; } p { margin: 0 0 0.9em; text-align: justify; }`,
    );
    const manifestItems = [
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="css" href="style.css" media-type="text/css"/>`,
    ];
    const spineItems = [];
    const navLinks = [];
    pages.forEach((pText, idx) => {
      const chNum = idx + 1;
      const paras = (pText || "")
        .split(/\n{2,}|\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const chTitle = paras[0]?.slice(0, 72) || `Capítulo ${chNum}`;
      const bodyHtml = (paras.length ? paras : [`Página ${chNum}`])
        .map((ln) => `<p>${xmlEsc(ln)}</p>`)
        .join("\n    ");
      zip.file(
        `OEBPS/chapter-${chNum}.xhtml`,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR">
<head>
  <title>${xmlEsc(chTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${xmlEsc(chTitle)}</h2>
  ${bodyHtml}
</body>
</html>`,
      );
      manifestItems.push(
        `<item id="ch${chNum}" href="chapter-${chNum}.xhtml" media-type="application/xhtml+xml"/>`,
      );
      spineItems.push(`<itemref idref="ch${chNum}"/>`);
      navLinks.push(
        `<li><a href="chapter-${chNum}.xhtml">${xmlEsc(chTitle)}</a></li>`,
      );
    });
    zip.file(
      "OEBPS/nav.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="pt-BR">
<head><title>${xmlEsc(bookTitle)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${xmlEsc(bookTitle)}</h1>
    <ol>${navLinks.join("\n      ")}</ol>
  </nav>
</body>
</html>`,
    );
    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${xmlEsc(uid)}</dc:identifier>
    <dc:title>${xmlEsc(bookTitle)}</dc:title>
    <dc:creator>${xmlEsc(bookAuthor)}</dc:creator>
    <dc:language>pt-BR</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine>
    ${spineItems.join("\n    ")}
  </spine>
</package>`,
    );
    const epubBlob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
    });
    return [output(epubBlob, `${name}.epub`)];
  }

  // EPUB -> PDF
  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  let opfPath = paths.find((p) => /\.opf$/i.test(p));
  if (!opfPath && zip.file("META-INF/container.xml")) {
    const containerXml = await zip.file("META-INF/container.xml").async("string");
    const m = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (m && zip.file(m[1])) opfPath = m[1];
  }
  const opfDir =
    opfPath && opfPath.includes("/")
      ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
      : "";
  let orderedFiles = [];
  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath).async("string");
    const manifestMap = new Map();
    for (const m of opfXml.matchAll(/<item\b([^>]+)\/?>/gi)) {
      const attrs = m[1];
      const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
      const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (id && href)
        manifestMap.set(id, opfDir + decodeURIComponent(href.split("#")[0]));
    }
    for (const s of opfXml.matchAll(
      /<itemref\b[^>]*\bidref=["']([^"']+)["']/gi,
    )) {
      const target = manifestMap.get(s[1]);
      if (target && zip.file(target)) orderedFiles.push(target);
    }
  }
  if (!orderedFiles.length) {
    orderedFiles = paths
      .filter((p) => /\.(x?html|htm)$/i.test(p) && !/nav\.xhtml$/i.test(p))
      .sort();
  }
  const htmlChapters = [];
  for (const p of orderedFiles) {
    const rawHtml = await zip.file(p).async("string");
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    htmlChapters.push(bodyMatch ? bodyMatch[1] : rawHtml);
  }
  const fullHtml = htmlChapters.join("\n<hr/>\n");
  if (!fullHtml.trim())
    throw new Error("Nenhum capítulo legível encontrado no EPUB / No readable chapters in EPUB.");
  const pdfDoc = await wordHtmlToPdf(fullHtml);
  if (o.title) pdfDoc.setTitle(String(o.title));
  if (o.author) pdfDoc.setAuthor(String(o.author));
  return [
    output(
      new Blob([await pdfDoc.save({ useObjectStreams: true })], {
        type: "application/pdf",
      }),
      `${name}.pdf`,
    ),
  ];
}

async function comparePdf(files, o, ctx) {
  if (files.length < 2)
    throw new Error(
      "Selecione dois arquivos PDF para comparar / Select two PDF files to compare.",
    );
  const [pagesA, pagesB] = await Promise.all([
    extractText(files[0], ctx),
    extractText(files[1], ctx),
  ]);
  const textA = pagesA
    .map((p, i) => `=== Página ${i + 1} ===\n${p}`)
    .join("\n\n");
  const textB = pagesB
    .map((p, i) => `=== Página ${i + 1} ===\n${p}`)
    .join("\n\n");
  const { diffStructured, compareLines } = await import("./text.js");
  const rows = diffStructured(textA, textB);
  const diffTxt = compareLines(textA, textB);
  const added = rows.filter((r) => r.type === "add" || r.type === "change").length;
  const removed = rows.filter((r) => r.type === "del" || r.type === "change").length;
  const summaryHeader = `Comparação de PDFs (TinyLab)\nArquivo A: ${files[0].name} (${pagesA.length} páginas)\nArquivo B: ${files[1].name} (${pagesB.length} páginas)\nBlocos alterados/adicionados: +${added} | removidos: -${removed}\n\n`;
  const reportPdf = await textPDF(summaryHeader + diffTxt);
  return [
    output(
      reportPdf,
      `${baseName(files[0].name)}-vs-${baseName(files[1].name)}-diff.pdf`,
    ),
    {
      ...textOutput(
        summaryHeader + diffTxt,
        `${baseName(files[0].name)}-vs-${baseName(files[1].name)}.diff.txt`,
      ),
      diffRows: rows,
      viewMode: o.viewMode || "split",
    },
  ];
}

export async function run(id, files, o, ctx = {}) {
  const name = baseName(files[0]?.name || "tinylab");
  const originalSize = files[0]?.size;
  const pdfResult = async (d) => [
    {
      ...output(
        new Blob([await d.save({ useObjectStreams: true })], {
          type: "application/pdf",
        }),
        `${name}-${id}.pdf`,
      ),
      ...(originalSize ? { originalSize } : {}),
    },
  ];

  if (id === "text-to-pdf")
    return [output(await textPDF(o.content), "tinylab.pdf")];

  if (id === "markdown-to-pdf") {
    const raw = String(o.content || "").trim();
    if (!raw) throw new Error("Conteúdo vazio / Empty content.");
    const { marked } = await import("marked");
    let html = await marked.parse(raw);
    if (typeof window !== "undefined") {
      const { default: DOMPurify } = await import("dompurify");
      html = DOMPurify.sanitize(html, {
        FORBID_TAGS: ["script", "iframe", "style", "form", "input", "object"],
      });
    }
    const doc = await wordHtmlToPdf(html);
    return [
      output(
        new Blob([await doc.save({ useObjectStreams: true })], {
          type: "application/pdf",
        }),
        "tinylab-markdown.pdf",
      ),
    ];
  }

  if (id === "pdf-to-excel") {
    return pdfToExcel(files[0], name, o, ctx);
  }

  if (id === "pdf-to-pptx") {
    return pdfToPptx(files[0], name, o, ctx);
  }

  if (id === "epub-pdf") {
    return epubPdf(files[0], name, o, ctx);
  }

  if (id === "compare-pdf") {
    return comparePdf(files, o, ctx);
  }

  if (id === "pdf-to-text") {
    const pages = await extractText(files[0], ctx);
    if (!pages.join("").trim())
      throw new Error(
        "PDF sem texto selecionável. Use OCR de PDF / No selectable text. Use PDF OCR.",
      );
    return [textOutput(pages.join("\n\n---\n\n"), `${name}.txt`)];
  }

  if (id === "pdf-to-word") {
    return pdfToStructuredWord(files[0], name, ctx);
  }

  if (id === "word-to-pdf" && o.mode !== "companion") {
    if (!/\.docx$/i.test(files[0].name))
      throw new Error(
        "DOC/ODT exigem o modo Layout fiel LibreOffice / DOC/ODT require LibreOffice layout mode.",
      );
    const module = await import("mammoth");
    const mammoth = module.default || module;
    const ab = await files[0].arrayBuffer();
    const { value } = await mammoth.convertToHtml(
      typeof Buffer !== "undefined" && typeof window === "undefined"
        ? { buffer: Buffer.from(ab) }
        : { arrayBuffer: ab },
    );
    const doc = await wordHtmlToPdf(value);
    return pdfResult(doc);
  }

  if (id === "word-to-pdf" || id === "office-to-pdf") {
    const isLoopback =
      typeof location !== "undefined" &&
      (location.hostname === "127.0.0.1" || location.hostname === "localhost");
    const endpoint = new URL(
      isLoopback ? "../api/office" : "../api/office.php",
      import.meta.url,
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": encodeURIComponent(files[0].name),
      },
      body: files[0],
      signal: ctx.signal,
    });
    if (!res.ok) {
      let detail;
      try {
        detail = (await res.json()).error;
      } catch {}
      throw new Error(
        detail ||
          "Serviço de conversão indisponível no momento. Para .docx você também pode usar o modo No navegador / Conversion service unavailable. For .docx you can also use In browser mode.",
      );
    }
    return [{ ...output(await res.blob(), `${name}.pdf`), originalSize }];
  }

  if (id === "protect-pdf" || id === "unlock-pdf") {
    if (!o.password) throw new Error("Informe a senha / Enter the password.");
    const { PDF } = await import("@libpdf/core");
    const doc = await PDF.load(
      new Uint8Array(await files[0].arrayBuffer()),
      id === "unlock-pdf" ? { credentials: o.password } : {},
    );
    if (doc.isEncrypted && !doc.isAuthenticated)
      throw new Error("Senha incorreta / Incorrect password.");
    if (id === "protect-pdf")
      doc.setProtection({ userPassword: o.password, algorithm: "AES-256" });
    else doc.removeProtection({ ignorePermissions: true });
    return [
      output(
        new Blob([await doc.save()], { type: "application/pdf" }),
        `${name}-${id}.pdf`,
      ),
    ];
  }

  if (id === "images-to-pdf") {
    const doc = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      check(ctx);
      const img = await bitmap(files[i]),
        c = canvas(img.width, img.height);
      c.getContext("2d").drawImage(img, 0, 0);
      img.close?.();
      const image = await doc.embedPng(await (await toBlob(c)).arrayBuffer());
      const [w, h] =
        o.paper === "a4" ? [595.28, 841.89] : [image.width, image.height];
      const scale = Math.min(w / image.width, h / image.height);
      const page = doc.addPage([w, h]);
      page.drawImage(image, {
        x: (w - image.width * scale) / 2,
        y: (h - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      });
      progress(ctx, ((i + 1) / files.length) * 95);
      await tick();
    }
    return pdfResult(doc);
  }

  if (
    id === "pdf-to-images" ||
    id === "ocr-pdf" ||
    (id === "compress-pdf" && o.mode === "raster") ||
    id === "pdf-extract-images"
  ) {
    const doc = await loadView(files[0]);
    try {
      const indices = pageIndices(o.pages, doc.numPages),
        results = [],
        target = id === "compress-pdf" ? await PDFDocument.create() : null;
      let ocrWorker, ocrDoc, ocrPages, ocrFont, ocrAllowed;
      const ocrTexts = [];
      if (id === "ocr-pdf") {
        const { createOCR } = await import("./ocr.js");
        ocrWorker = await createOCR(o.language, ctx);
        const srcDoc = await PDFDocument.load(await files[0].arrayBuffer());
        ocrDoc = await PDFDocument.create();
        ocrPages = await ocrDoc.copyPages(srcDoc, indices);
        ocrFont = await embedFont(ocrDoc);
        ocrAllowed = new Set(ocrFont.getCharacterSet());
      }
      try {
        for (let n = 0; n < indices.length; n++) {
          check(ctx);
          const i = indices[n];
          progress(ctx, (n / indices.length) * 95);
          if (id === "pdf-extract-images") {
            const imgs = await extractPageImages(doc, i);
            imgs.forEach((im, k) =>
              results.push(
                output(im.blob, `${name}-p${i + 1}-img${k + 1}.png`),
              ),
            );
            continue;
          }
          const scale = id === "ocr-pdf" ? 2 : Number(o.scale || 1.6);
          const c = await renderPage(doc, i, scale);
          if (id === "ocr-pdf") {
            const { data } = await ocrWorker.recognize(
              c,
              {},
              { text: true, blocks: true },
            );
            const pdfPage = ocrDoc.addPage(ocrPages[n]);
            const { width: pw, height: ph } = pdfPage.getSize();
            const words = extractOcrWords(data);
            if (words.length) {
              pdfPage.pushOperators(
                setTextRenderingMode(TextRenderingMode.Invisible),
              );
              for (const w of words) {
                const clean = sanitizeForFont(w.text, ocrAllowed).trim();
                if (!clean || !w.bbox) continue;
                const { x0, y0, x1, y1 } = w.bbox;
                const boxW = Math.max(2, ((x1 - x0) / c.width) * pw);
                const boxH = Math.max(4, ((y1 - y0) / c.height) * ph);
                const pdfX = (x0 / c.width) * pw;
                const pdfY = ph - (y1 / c.height) * ph + boxH * 0.12;
                const unitW = Math.max(0.1, ocrFont.widthOfTextAtSize(clean, 1));
                const fSize = Math.max(4, Math.min(boxH * 0.95, boxW / unitW));
                pdfPage.drawText(clean, {
                  x: pdfX,
                  y: pdfY,
                  size: fSize,
                  font: ocrFont,
                });
              }
              pdfPage.pushOperators(
                setTextRenderingMode(TextRenderingMode.Fill),
              );
            }
            ocrTexts.push((data.text || "").trim());
          } else if (target) {
            const image = await target.embedJpg(
              await (
                await toBlob(c, "image/jpeg", Number(o.quality) / 100)
              ).arrayBuffer(),
            );
            const original = await doc.getPage(i + 1),
              v = original.getViewport({ scale: 1 }),
              page = target.addPage([v.width, v.height]);
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: v.width,
              height: v.height,
            });
          } else {
            const fmt = o.format || "png";
            results.push(
              output(
                await toBlob(c, `image/${fmt}`, 0.92),
                `${name}-p${i + 1}.${fmt === "jpeg" ? "jpg" : fmt}`,
              ),
            );
          }
          await tick();
        }
        if (id === "ocr-pdf") {
          const pdfBytes = await ocrDoc.save({ useObjectStreams: true });
          return [
            {
              ...output(
                new Blob([pdfBytes], { type: "application/pdf" }),
                `${name}-ocr-pesquisavel.pdf`,
              ),
              originalSize,
            },
            textOutput(ocrTexts.join("\n\n---\n\n"), `${name}-ocr.txt`),
          ];
        }
        if (target) return pdfResult(target);
        if (!results.length)
          throw new Error(
            "Nenhuma imagem raster incorporada encontrada / No embedded raster images found.",
          );
        return results;
      } finally {
        await ocrWorker?.terminate();
      }
    } finally {
      await doc.destroy();
    }
  }

  const doc = await PDFDocument.load(await files[0].arrayBuffer());
  const pages = doc.getPages(),
    count = pages.length;

  if (id === "merge-pdf") {
    if (files.length < 2)
      throw new Error(
        "Selecione pelo menos dois PDFs / Select at least two PDFs.",
      );
    const target = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const src =
        i === 0 ? doc : await PDFDocument.load(await files[i].arrayBuffer());
      for (const p of await target.copyPages(src, src.getPageIndices()))
        target.addPage(p);
      progress(ctx, ((i + 1) / files.length) * 95);
      await tick();
    }
    return pdfResult(target);
  }

  if (
    ["split-pdf", "split-all-pdf", "organize-pdf", "delete-pages"].includes(id)
  ) {
    let indices = pageIndices(o.pages, count);
    if (id === "delete-pages") {
      if (!String(o.pages || "").trim())
        throw new Error(
          "Informe as páginas a excluir / Enter pages to delete.",
        );
      indices = doc.getPageIndices().filter((i) => !indices.includes(i));
    }
    if (id === "organize-pdf") indices = o.pageOrder || doc.getPageIndices();
    if (!indices.length)
      throw new Error(
        "O PDF precisa ter ao menos uma página / PDF needs at least one page.",
      );
    if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= count))
      throw new Error("Página inválida / Invalid page.");
    if (id === "split-all-pdf") {
      const res = [];
      for (const i of indices) {
        const target = await PDFDocument.create();
        target.addPage((await target.copyPages(doc, [i]))[0]);
        res.push(
          output(
            new Blob([await target.save()], { type: "application/pdf" }),
            `${name}-p${i + 1}.pdf`,
          ),
        );
        progress(ctx, ((i + 1) / count) * 95);
        await tick();
      }
      return res;
    }
    const target = await PDFDocument.create();
    for (const p of await target.copyPages(doc, indices)) target.addPage(p);
    return pdfResult(target);
  }

  if (id === "rotate-pdf") {
    for (const i of pageIndices(o.pages, count))
      pages[i].setRotation(
        degrees((pages[i].getRotation().angle + Number(o.angle)) % 360),
      );
  } else if (id === "watermark-pdf" || id === "number-pdf") {
    const font = await embedFont(doc);
    pages.forEach((p, i) => {
      const { width, height } = p.getSize();
      if (id === "number-pdf") {
        const s = String(Number(o.start) + i);
        p.drawText(s, {
          x: (width - font.widthOfTextAtSize(s, 10)) / 2,
          y: 20,
          font,
          size: 10,
          color: rgb(0.3, 0.3, 0.3),
        });
      } else {
        const s = String(o.content || ""),
          size = Math.min(
            48,
            (width * 0.8) / Math.max(1, font.widthOfTextAtSize(s, 1)),
          );
        p.drawText(s, {
          x: width * 0.15,
          y: height * 0.4,
          font,
          size,
          rotate: degrees(35),
          opacity: Number(o.opacity) / 100,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    });
  } else if (id === "crop-pdf") {
    for (const p of pages) {
      const { x, y, width, height } = p.getCropBox(),
        m = Number(o.margin);
      if (width <= 2 * m || height <= 2 * m)
        throw new Error(
          "Margem maior que a página / Margin exceeds page size.",
        );
      p.setCropBox(x + m, y + m, width - 2 * m, height - 2 * m);
    }
  } else if (id === "fill-pdf") {
    const form = doc.getForm();
    for (const [fieldName, value] of Object.entries(o.formFields || {})) {
      const f = form.getField(fieldName);
      if (f instanceof PDFTextField) f.setText(String(value));
      else if (f instanceof PDFCheckBox) value ? f.check() : f.uncheck();
      else if (
        f instanceof PDFDropdown ||
        f instanceof PDFOptionList ||
        f instanceof PDFRadioGroup
      )
        f.select(String(value));
    }
    form.updateFieldAppearances(await embedFont(doc));
  } else if (id === "annotate-pdf" || id === "sign-pdf") {
    const entries = Array.isArray(o.overlays) && o.overlays.length
      ? o.overlays
      : o.overlay
        ? [{ page: Math.max(0, Number(o.page || 1) - 1), bytes: o.overlay }]
        : [];
    if (!entries.length)
      throw new Error(
        "Faça uma anotação ou assinatura na prévia / Draw an annotation or signature on the preview.",
      );
    const drawOverlayOnPage = (p, image) => {
      const { x, y, width, height } = p.getCropBox();
      const angle = ((p.getRotation().angle % 360) + 360) % 360;
      if (angle === 90)
        p.drawImage(image, {
          x: x + width,
          y,
          width: height,
          height: width,
          rotate: degrees(90),
        });
      else if (angle === 180)
        p.drawImage(image, {
          x: x + width,
          y: y + height,
          width,
          height,
          rotate: degrees(180),
        });
      else if (angle === 270)
        p.drawImage(image, {
          x,
          y: y + height,
          width: height,
          height: width,
          rotate: degrees(270),
        });
      else p.drawImage(image, { x, y, width, height });
    };
    if (id === "sign-pdf" && o.applyScope === "all") {
      const curIdx = Math.max(0, Number(o.page || 1) - 1);
      const chosen =
        entries.find((e) => e.page === curIdx) || entries[0];
      const embedded = await doc.embedPng(chosen.bytes);
      for (const p of pages) drawOverlayOnPage(p, embedded);
    } else {
      for (const item of entries) {
        const p = pages[item.page];
        if (!p)
          throw new Error("Página inexistente / Page does not exist.");
        const embedded = await doc.embedPng(item.bytes);
        drawOverlayOnPage(p, embedded);
      }
    }
  } else if (id === "compress-pdf") {
    await recompressPdfImages(doc, o, ctx);
  } else if (id === "flatten-pdf") {
    if (o.mode === "full") {
      const view = await loadView(files[0]);
      try {
        const target = await PDFDocument.create();
        const sc = Math.max(1, Math.min(3, Number(o.scale || 2)));
        for (let i = 0; i < view.numPages; i++) {
          check(ctx);
          const vp = (await view.getPage(i + 1)).getViewport({ scale: 1 });
          const c = await renderPage(view, i, sc);
          const jpg = await toBlob(c, "image/jpeg", 0.9);
          const img = await target.embedJpg(await jpg.arrayBuffer());
          const p = target.addPage([vp.width, vp.height]);
          p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
          progress(ctx, ((i + 1) / view.numPages) * 95);
          await tick();
        }
        return pdfResult(target);
      } finally {
        await view.destroy();
      }
    } else {
      const form = doc.getForm();
      if (form.getFields().length) {
        try {
          form.updateFieldAppearances(await embedFont(doc));
        } catch {}
        form.flatten();
      }
    }
  } else if (id === "redact-pdf") {
    const boxesByPage = new Map();
    if (Array.isArray(o.redactBoxes)) {
      for (const entry of o.redactBoxes) {
        if (Array.isArray(entry.boxes) && entry.boxes.length) {
          boxesByPage.set(entry.page, [...entry.boxes]);
        }
      }
    }
    if (String(o.terms || "").trim()) {
      const autoMap = await findTermRedactionBoxes(files[0], o.terms);
      for (const [pIdx, list] of autoMap.entries()) {
        boxesByPage.set(pIdx, [...(boxesByPage.get(pIdx) || []), ...list]);
      }
    }
    if (!boxesByPage.size)
      throw new Error(
        "Desenhe ao menos uma tarja na prévia ou informe termos para ocultar / Draw a redaction box or enter terms to redact.",
      );
    const fillHex = o.redactColor === "#ffffff" ? "#ffffff" : "#000000";
    const target = await PDFDocument.create();
    target.setTitle("");
    target.setAuthor("");
    target.setSubject("");
    target.setKeywords([]);
    target.setCreator("");
    target.setProducer("");
    const view = ctx.rasterizeRedactedPage ? null : await loadView(files[0]);
    try {
      for (let i = 0; i < count; i++) {
        check(ctx);
        const pageBoxes = boxesByPage.get(i);
        if (!pageBoxes?.length) {
          const [copied] = await target.copyPages(doc, [i]);
          target.addPage(copied);
        } else if (ctx.rasterizeRedactedPage) {
          const { width, height } = pages[i].getSize();
          const pngBytes = await ctx.rasterizeRedactedPage(i, pageBoxes, fillHex);
          const embedded = await target.embedPng(pngBytes);
          const p = target.addPage([width, height]);
          p.drawImage(embedded, { x: 0, y: 0, width, height });
        } else {
          const vp = (await view.getPage(i + 1)).getViewport({ scale: 1 });
          const c = await renderPage(view, i, 2);
          const g = c.getContext("2d");
          g.fillStyle = fillHex;
          for (const b of pageBoxes) {
            g.fillRect(
              b.x * c.width,
              b.y * c.height,
              b.w * c.width,
              b.h * c.height,
            );
          }
          const blob = await toBlob(c, "image/png");
          const embedded = await target.embedPng(await blob.arrayBuffer());
          const p = target.addPage([vp.width, vp.height]);
          p.drawImage(embedded, { x: 0, y: 0, width: vp.width, height: vp.height });
        }
        progress(ctx, ((i + 1) / count) * 95);
        await tick();
      }
    } finally {
      await view?.destroy();
    }
    return [
      {
        ...output(
          new Blob([await target.save({ useObjectStreams: true, updateMetadata: false })], {
            type: "application/pdf",
          }),
          `${name}-redacted.pdf`,
        ),
        ...(originalSize ? { originalSize } : {}),
      },
    ];
  } else if (id === "nup-pdf") {
    const layout = Number(o.layout || 4);
    const gridMap = {
      2: [2, 1],
      4: [2, 2],
      6: [3, 2],
      9: [3, 3],
    };
    const [cols, rows] = gridMap[layout] || [2, 2];
    const isLandscape =
      o.orientation === "landscape" ||
      (o.orientation !== "portrait" && (layout === 2 || layout === 6));
    const SW = isLandscape ? 841.89 : 595.28;
    const SH = isLandscape ? 595.28 : 841.89;
    const margin = 20,
      gap = 12;
    const cellW = (SW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = (SH - margin * 2 - gap * (rows - 1)) / rows;
    const target = await PDFDocument.create();
    const embeddedPages = await target.embedPages(pages);
    for (let i = 0; i < embeddedPages.length; i += layout) {
      check(ctx);
      const sheet = target.addPage([SW, SH]);
      for (let j = 0; j < layout && i + j < embeddedPages.length; j++) {
        const ep = embeddedPages[i + j];
        const col = j % cols,
          row = Math.floor(j / cols);
        const cx = margin + col * (cellW + gap);
        const cy = SH - margin - (row + 1) * cellH - row * gap;
        const scale = Math.min(cellW / ep.width, cellH / ep.height);
        const dw = ep.width * scale,
          dh = ep.height * scale;
        const dx = cx + (cellW - dw) / 2,
          dy = cy + (cellH - dh) / 2;
        sheet.drawPage(ep, { x: dx, y: dy, width: dw, height: dh });
        if (o.border !== "no") {
          sheet.drawRectangle({
            x: dx,
            y: dy,
            width: dw,
            height: dh,
            borderColor: rgb(0.8, 0.8, 0.85),
            borderWidth: 0.4,
          });
        }
      }
      progress(ctx, (Math.min(embeddedPages.length, i + layout) / embeddedPages.length) * 95);
      await tick();
    }
    return pdfResult(target);
  } else if (id === "pdf-metadata") {
    if (o.mode === "clear") {
      doc.setTitle("");
      doc.setAuthor("");
      doc.setSubject("");
      doc.setKeywords([]);
      doc.setCreator("");
      doc.setProducer("");
    } else {
      doc.setTitle(String(o.title || ""));
      doc.setAuthor(String(o.author || ""));
      doc.setSubject(String(o.subject || ""));
      const kw = String(o.keywords || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      doc.setKeywords(kw);
    }
    const savedBytes = await doc.save({
      useObjectStreams: true,
      updateMetadata: false,
    });
    const summary = {
      title: doc.getTitle() || "",
      author: doc.getAuthor() || "",
      subject: doc.getSubject() || "",
      keywords: doc.getKeywords() || "",
      creator: doc.getCreator() || "",
      producer: doc.getProducer() || "",
      pages: count,
    };
    return [
      {
        ...output(
          new Blob([savedBytes], { type: "application/pdf" }),
          `${name}-metadata.pdf`,
        ),
        ...(originalSize ? { originalSize } : {}),
      },
      textOutput(
        JSON.stringify(summary, null, 2),
        `${name}-metadata.json`,
        "application/json",
      ),
    ];
  } else if (id === "edit-pdf-text") {
    const findStr = String(o.find || "").trim();
    const replaceStr = String(o.replace ?? "");
    if (!findStr)
      throw new Error(
        "Informe o texto que deseja localizar / Enter the text to find.",
      );
    const font = await embedFont(doc);
    const allowed = new Set(font.getCharacterSet());
    const indices = pageIndices(o.pages, count);
    const parseHexRgb = (h) => {
      const m = String(h || "#000000")
        .replace("#", "")
        .padEnd(6, "0");
      return rgb(
        parseInt(m.slice(0, 2), 16) / 255,
        parseInt(m.slice(2, 4), 16) / 255,
        parseInt(m.slice(4, 6), 16) / 255,
      );
    };
    const bgClr = parseHexRgb(o.bgColor || "#ffffff");
    const txtClr = parseHexRgb(o.color || "#111111");
    const view = await loadView(files[0]);
    let replacements = 0;
    try {
      const needleLower = findStr.toLowerCase();
      for (const pIdx of indices) {
        check(ctx);
        const vpPage = await view.getPage(pIdx + 1);
        const tc = await vpPage.getTextContent();
        const pdfPage = pages[pIdx];
        const { width: pw } = pdfPage.getSize();
        for (const it of tc.items) {
          const raw = it.str || "";
          if (!raw || !raw.toLowerCase().includes(needleLower)) continue;
          const tr = it.transform || [12, 0, 0, 12, 40, 40];
          const fSize = Math.max(
            6,
            Math.hypot(tr[2], tr[3]) || Math.abs(tr[0]) || 12,
          );
          const x = tr[4] || 0;
          const y = tr[5] || 0;
          const origW = Math.max(
            it.width || raw.length * fSize * 0.52,
            font.widthOfTextAtSize(sanitizeForFont(raw, allowed), fSize),
          );
          const updatedStr = sanitizeForFont(
            raw.replace(
              new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
              replaceStr,
            ),
            allowed,
          );
          pdfPage.drawRectangle({
            x: Math.max(0, x - 1.5),
            y: y - fSize * 0.24,
            width: origW + 3,
            height: fSize * 1.28,
            color: bgClr,
          });
          if (updatedStr) {
            const availW = Math.max(40, pw - x - 18);
            const neededW = font.widthOfTextAtSize(updatedStr, fSize);
            const drawSize =
              neededW > availW ? Math.max(6, (fSize * availW) / neededW) : fSize;
            pdfPage.drawText(updatedStr, {
              x,
              y,
              size: drawSize,
              font,
              color: txtClr,
            });
          }
          replacements++;
        }
      }
    } finally {
      await view.destroy();
    }
    if (!replacements)
      throw new Error(
        "Texto não encontrado nas páginas selecionadas / Text not found on the selected pages.",
      );
    return pdfResult(doc);
  } else if (id === "grayscale-pdf") {
    const canCanvas =
      typeof OffscreenCanvas !== "undefined" ||
      typeof HTMLCanvasElement !== "undefined";
    if ((o.mode === "raster" || o.mode === "bw") && canCanvas) {
      const view = await loadView(files[0]);
      const target = await PDFDocument.create();
      try {
        for (let i = 0; i < count; i++) {
          check(ctx);
          const vp = (await view.getPage(i + 1)).getViewport({ scale: 1 });
          const c = await renderPage(view, i, 1.75);
          const g = c.getContext("2d");
          const px = g.getImageData(0, 0, c.width, c.height);
          const d = px.data;
          const isBw = o.mode === "bw";
          for (let k = 0; k < d.length; k += 4) {
            const lum = Math.round(
              0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2],
            );
            const v = isBw ? (lum >= 150 ? 255 : 0) : lum;
            d[k] = v;
            d[k + 1] = v;
            d[k + 2] = v;
          }
          g.putImageData(px, 0, 0);
          const jpg = await (await toBlob(c, "image/jpeg", 0.88)).arrayBuffer();
          const img = await target.embedJpg(jpg);
          const p = target.addPage([vp.width, vp.height]);
          p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
          progress(ctx, ((i + 1) / count) * 95);
          await tick();
        }
      } finally {
        await view.destroy();
      }
      return pdfResult(target);
    }
    // Smart vector-preserving grayscale: convert embedded RGB XObject streams + RGB stream operators
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      const subtype = dict.lookup(PDFName.of("Subtype"))?.toString?.() || "";
      if (subtype === "/Image") {
        const iw = dict.lookup(PDFName.of("Width"))?.asNumber?.() || 0;
        const ih = dict.lookup(PDFName.of("Height"))?.asNumber?.() || 0;
        const bpc = dict.lookup(PDFName.of("BitsPerComponent"))?.asNumber?.() ?? 8;
        const cs = dict.lookup(PDFName.of("ColorSpace"))?.toString?.() || "";
        const filter = dict.lookup(PDFName.of("Filter"))?.toString?.() || "";
        if (iw > 0 && ih > 0 && bpc === 8 && cs === "/DeviceRGB" && !filter.includes("DCTDecode")) {
          try {
            const decoded = decodePDFRawStream(obj).decode();
            if (decoded.length >= iw * ih * 3) {
              const gray = new Uint8Array(iw * ih);
              const isBw = o.mode === "bw";
              for (let p = 0, s = 0; p < iw * ih; p++, s += 3) {
                const lum = Math.round(
                  0.299 * decoded[s] + 0.587 * decoded[s + 1] + 0.114 * decoded[s + 2],
                );
                gray[p] = isBw ? (lum >= 150 ? 255 : 0) : lum;
              }
              const flate = doc.context.flateStream(gray);
              const nextDict = dict.clone(doc.context);
              nextDict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceGray"));
              nextDict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
              nextDict.delete(PDFName.of("DecodeParms"));
              nextDict.set(
                PDFName.of("Length"),
                doc.context.obj(flate.contents.length),
              );
              doc.context.assign(ref, PDFRawStream.of(nextDict, flate.contents));
            }
          } catch {}
        }
      } else if (!subtype) {
        try {
          const raw = decodePDFRawStream(obj).decode();
          const str = new TextDecoder("latin1").decode(raw);
          if (/\b(rg|RG)\b/.test(str)) {
            const grayStr = str.replace(
              /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(rg|RG)\b/g,
              (_, r, g, b, op) => {
                const y = (
                  0.299 * Number(r) +
                  0.587 * Number(g) +
                  0.114 * Number(b)
                ).toFixed(3);
                return `${y} ${op === "rg" ? "g" : "G"}`;
              },
            );
            if (grayStr !== str) {
              const encoded = new Uint8Array(grayStr.length);
              for (let k = 0; k < grayStr.length; k++)
                encoded[k] = grayStr.charCodeAt(k) & 0xff;
              const flate = doc.context.flateStream(encoded);
              const nextDict = dict.clone(doc.context);
              nextDict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
              nextDict.set(
                PDFName.of("Length"),
                doc.context.obj(flate.contents.length),
              );
              doc.context.assign(ref, PDFRawStream.of(nextDict, flate.contents));
            }
          }
        } catch {}
      }
    }
    return pdfResult(doc);
  } else {
    throw new Error("Ferramenta desconhecida / Unknown tool.");
  }

  return pdfResult(doc);
}
