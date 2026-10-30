import {
  PDFDocument,
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
  if (!pdfjsPromise)
    pdfjsPromise = import("pdfjs-dist/build/pdf.mjs").then((m) => {
      const p = m.default || m;
      p.GlobalWorkerOptions.workerSrc = asset("pdf.worker.min.mjs");
      return p;
    });
  return pdfjsPromise;
}
export async function loadView(file) {
  const p = await pdfjs();
  return p.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: asset("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts/"),
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
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  doc.registerFontkit(fontkit);
  if (!fontBytes)
    fontBytes = fetch(asset("DejaVuSans.ttf")).then((r) => {
      if (!r.ok) throw new Error("Fonte indisponível / Font unavailable.");
      return r.arrayBuffer();
    });
  return doc.embedFont(await fontBytes, { subset: true });
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
  const sanitized = Array.from(String(s))
    .map((c) =>
      c === "\n" || c === "\t" || allowed.has(c.codePointAt(0)) ? c : "?",
    )
    .join("")
    .replace(/\t/g, "    ");
  for (const original of sanitized.split("\n")) {
    let words = original.split(" "),
      line = "";
    const emit = () => {
      if (y < 48) add();
      page.drawText(line, { x: 40, y, size: 10, font });
      y -= 15;
      line = "";
    };
    for (let word of words) {
      while (font.widthOfTextAtSize(word, 10) > 515) {
        if (line) emit();
        let cut = 1;
        while (
          cut < word.length &&
          font.widthOfTextAtSize(word.slice(0, cut + 1), 10) <= 515
        )
          cut++;
        line = word.slice(0, cut);
        emit();
        word = word.slice(cut);
      }
      if (font.widthOfTextAtSize((line ? line + " " : "") + word, 10) > 515)
        emit();
      line += (line ? " " : "") + word;
    }
    emit();
  }
  return new Blob([await doc.save()], { type: "application/pdf" });
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
export async function run(id, files, o, ctx = {}) {
  const name = baseName(files[0]?.name || "tinylab");
  const pdfResult = async (d) => [
    output(
      new Blob([await d.save()], { type: "application/pdf" }),
      `${name}-${id}.pdf`,
    ),
  ];
  if (id === "text-to-pdf")
    return [output(await textPDF(o.content), "tinylab.pdf")];
  if (id === "pdf-to-text" || id === "pdf-to-word") {
    const pages = await extractText(files[0], ctx);
    if (!pages.join("").trim())
      throw new Error(
        "PDF sem texto selecionável. Use OCR de PDF / No selectable text. Use PDF OCR.",
      );
    if (id === "pdf-to-text")
      return [textOutput(pages.join("\n\n---\n\n"), `${name}.txt`)];
    const { Document, Packer, Paragraph, TextRun, PageBreak } = await import(
      "docx"
    );
    const children = [];
    pages.forEach((page, i) => {
      if (i) children.push(new Paragraph({ children: [new PageBreak()] }));
      page
        .split("\n")
        .forEach((line) =>
          children.push(new Paragraph({ children: [new TextRun(line)] })),
        );
    });
    return [
      output(
        await Packer.toBlob(new Document({ sections: [{ children }] })),
        `${name}.docx`,
      ),
    ];
  }
  if (id === "word-to-pdf" && o.mode !== "companion") {
    if (!/\.docx$/i.test(files[0].name))
      throw new Error(
        "DOC/ODT exigem o modo local com LibreOffice / DOC/ODT require local LibreOffice mode.",
      );
    const module = await import("mammoth");
    const mammoth = module.default || module;
    const { value } = await mammoth.convertToHtml({
      arrayBuffer: await files[0].arrayBuffer(),
    });
    const html = new DOMParser().parseFromString(value, "text/html");
    let text = "";
    for (const el of html.body.querySelectorAll("p,h1,h2,h3,li,tr"))
      text += el.textContent + "\n";
    const doc = await PDFDocument.load(
      await (await textPDF(text)).arrayBuffer(),
    );
    for (const el of html.querySelectorAll("img")) {
      if (!/^data:image\/(png|jpeg);base64,/.test(el.src)) continue;
      const bytes = Uint8Array.from(atob(el.src.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const img = el.src.startsWith("data:image/png")
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
      const scale = Math.min(515 / img.width, 740 / img.height, 1);
      const page = doc.addPage([595, 842]);
      page.drawImage(img, {
        x: 40,
        y: 842 - 50 - img.height * scale,
        width: img.width * scale,
        height: img.height * scale,
      });
    }
    return pdfResult(doc);
  }
  if (id === "word-to-pdf" || id === "office-to-pdf") {
    const res = await fetch(new URL("../api/office", import.meta.url), {
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
          "Inicie npm run dev para ativar o conversor local / Start npm run dev to enable local conversion.",
      );
    }
    return [output(await res.blob(), `${name}.pdf`)];
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
      let ocrWorker;
      if (id === "ocr-pdf") {
        const { createOCR } = await import("./ocr.js");
        ocrWorker = await createOCR(o.language, ctx);
      }
      try {
        for (let n = 0; n < indices.length; n++) {
          check(ctx);
          const i = indices[n];
          progress(ctx, (n / indices.length) * 95);
          if (id === "pdf-extract-images") {
            const p = await pdfjs(),
              page = await doc.getPage(i + 1),
              ops = await page.getOperatorList();
            let k = 0;
            const seen = new Set();
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
              if (!image?.width) continue;
              const c = canvas(image.width, image.height),
                g = c.getContext("2d");
              if (image.bitmap) g.drawImage(image.bitmap, 0, 0);
              else {
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
              }
              results.push(
                output(await toBlob(c), `${name}-p${i + 1}-img${++k}.png`),
              );
            }
            continue;
          }
          const c = await renderPage(doc, i, Number(o.scale || 1.6));
          if (id === "ocr-pdf") {
            const { data } = await ocrWorker.recognize(c);
            results.push(textOutput(data.text, `${name}-p${i + 1}.txt`));
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
    for (const [name, value] of Object.entries(o.formFields || {})) {
      const f = form.getField(name);
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
    if (!o.overlay)
      throw new Error(
        "Faça uma anotação ou assinatura na prévia / Draw an annotation or signature on the preview.",
      );
    const i = Number(o.page) - 1;
    if (!pages[i]) throw new Error("Página inexistente / Page does not exist.");
    const p = pages[i],
      rotation = p.getRotation().angle,
      v = await loadView(files[0]);
    try {
      const c = await renderPage(v, i, 1.5),
        g = c.getContext("2d"),
        overlay = await bitmap(new Blob([o.overlay], { type: "image/png" }));
      g.drawImage(overlay, 0, 0, c.width, c.height);
      overlay.close?.();
      const image = await doc.embedPng(await (await toBlob(c)).arrayBuffer());
      const target = doc.insertPage(i, [c.width / 1.5, c.height / 1.5]);
      target.drawImage(image, {
        x: 0,
        y: 0,
        width: target.getWidth(),
        height: target.getHeight(),
      });
      doc.removePage(i + 1);
    } finally {
      await v.destroy();
    }
  } else if (id !== "compress-pdf")
    throw new Error("Ferramenta desconhecida / Unknown tool.");
  return pdfResult(doc);
}
