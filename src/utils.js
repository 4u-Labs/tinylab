export const tick = () => new Promise((r) => setTimeout(r, 0));
export function check(ctx = {}) {
  if (ctx.signal?.aborted)
    throw new DOMException(
      "Operação cancelada / Operation cancelled",
      "AbortError",
    );
}
export function progress(ctx, p, message = "") {
  check(ctx);
  ctx.progress?.(Math.max(0, Math.min(100, p)), message);
}
export function canvas(w, h) {
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w < 1 ||
    h < 1 ||
    w * h > 64e6
  )
    throw new Error(
      "Dimensões inválidas ou acima de 64 megapixels / Invalid dimensions or over 64 megapixels.",
    );
  const c =
    typeof document === "undefined"
      ? new OffscreenCanvas(Math.round(w), Math.round(h))
      : document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}
export async function toBlob(c, type = "image/png", quality = 0.9) {
  const b = c.convertToBlob
    ? await c.convertToBlob({ type, quality })
    : await new Promise((r, j) =>
        c.toBlob(
          (x) =>
            x
              ? r(x)
              : j(new Error("Falha ao gerar imagem / Image encoding failed")),
          type,
          quality,
        ),
      );
  if (b.type !== type)
    throw new Error(`Formato não suportado: ${type} / Unsupported format.`);
  return b;
}
export async function bitmap(file) {
  if (/\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type)) {
    const { heicTo } = await import("heic-to");
    file = await heicTo({ blob: file, type: "image/png" });
  }
  if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml") {
    let s = await file.text();
    const parsed = new DOMParser().parseFromString(s, "image/svg+xml");
    if (parsed.querySelector("parsererror") || /<!DOCTYPE|<!ENTITY/i.test(s))
      throw new Error("SVG inválido / Invalid SVG.");
    for (const el of parsed.querySelectorAll("*")) {
      if (
        [
          "script",
          "foreignobject",
          "iframe",
          "style",
          "animate",
          "animatetransform",
          "set",
        ].includes(el.localName.toLowerCase())
      )
        throw new Error(
          "SVG contém conteúdo ativo / SVG contains active content.",
        );
      for (const attr of [...el.attributes]) {
        const key = attr.localName.toLowerCase(),
          value = attr.value.trim();
        if (
          key.startsWith("on") ||
          (key === "href" &&
            value &&
            !value.startsWith("#") &&
            !/^data:image\/(png|jpeg|webp);base64,/i.test(value)) ||
          [...value.matchAll(/url\(([^)]*)\)/gi)].some(
            (m) =>
              !m[1]
                .trim()
                .replace(/^["']|["']$/g, "")
                .startsWith("#"),
          )
        )
          throw new Error(
            "SVG contém referências externas ou ativas / SVG contains external or active references.",
          );
      }
    }
    const { default: DOMPurify } = await import("dompurify");
    s = DOMPurify.sanitize(s, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: [
        "style",
        "foreignObject",
        "animate",
        "animateTransform",
        "set",
      ],
    });
    if (
      /<\s*(script|foreignObject|iframe)|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:(?!image\/))/i.test(
        s,
      )
    )
      throw new Error(
        "SVG contém conteúdo ativo ou externo / SVG contains active or external content.",
      );
    const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      return im;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return await createImageBitmap(file, { imageOrientation: "from-image" });
}
export const baseName = (n) =>
  String(n || "tinylab")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .slice(0, 120) || "tinylab";
export const output = (blob, name, text) => ({ blob, name, text });
export const textOutput = (
  text,
  name = "tinylab.txt",
  type = "text/plain;charset=utf-8",
) => output(new Blob([text], { type }), name, text);
export function pageIndices(spec, count, { emptyAll = true } = {}) {
  if (!String(spec || "").trim())
    return emptyAll ? Array.from({ length: count }, (_, i) => i) : [];
  const result = [];
  for (const item of String(spec).split(",")) {
    const match = item.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Intervalo inválido / Invalid page range.");
    const a = Number(match[1]),
      b = Number(match[2] || a);
    if (a < 1 || b > count || a > b)
      throw new Error(
        `Páginas devem estar entre 1 e ${count} / Pages must be within document.`,
      );
    for (let n = a; n <= b; n++) result.push(n - 1);
  }
  return [...new Set(result)];
}
export const safeName = (n) =>
  String(n)
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1f]/g, "_") || "file";
export async function zipOutputs(
  outputs,
  name = "tinylab-resultados.zip",
  ctx = {},
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = new Set();
  for (const item of outputs) {
    let n = safeName(item.name),
      i = 1;
    while (names.has(n)) n = `${i++}-${safeName(item.name)}`;
    names.add(n);
    zip.file(n, await item.blob.arrayBuffer());
  }
  return output(
    await zip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 3 },
      },
      (m) => progress(ctx, m.percent),
    ),
    name,
  );
}
export const humanBytes = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
export function validFiles(tool, files) {
  if (tool.input !== "files") return;
  if (!files.length) throw new Error("Selecione um arquivo / Select a file.");
  if (!tool.multiple && files.length > 1)
    throw new Error("Selecione somente um arquivo / Select only one file.");
  if (files.length > 200)
    throw new Error(
      "Máximo de 200 arquivos por operação / Maximum 200 files per operation.",
    );
  if (files.some((f) => !f.size))
    throw new Error("Arquivo vazio / Empty file.");
  if (files.reduce((a, f) => a + f.size, 0) > 512 * 1024 ** 2)
    throw new Error("O lote excede 512 MB / Batch exceeds 512 MB.");
  const rules = tool.accept.split(",");
  if (
    !rules.includes("*/*") &&
    files.some(
      (f) =>
        !rules.some((r) =>
          r.endsWith("/*")
            ? f.type.startsWith(r.slice(0, -1))
            : r.startsWith(".")
              ? f.name.toLowerCase().endsWith(r)
              : f.type === r,
        ),
    )
  )
    throw new Error(
      "Formato incompatível com a ferramenta / Incompatible file type.",
    );
}

export const asset = (p) => new URL(`../vendor/${p}`, import.meta.url).href;
