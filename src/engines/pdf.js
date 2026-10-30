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
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      y -= 4;
      drawParagraphText(el.textContent, {
        size: tag === "h1" ? 18 : tag === "h2" ? 14 : 12,
        color: rgb(0.14, 0.08, 0.28),
        gapAfter: 8,
      });
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
  } else {
    throw new Error("Ferramenta desconhecida / Unknown tool.");
  }

  return pdfResult(doc);
}
