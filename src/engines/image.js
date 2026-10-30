import {
  bitmap,
  canvas,
  toBlob,
  output,
  textOutput,
  baseName,
  progress,
  tick,
  check,
  zipOutputs,
  asset,
} from "../utils.js";
export function removeBackground(
  data,
  w,
  h,
  tolerance = 42,
  mode = "outer",
  feather = 18,
) {
  const corners = [0, w - 1, (h - 1) * w, w * h - 1];
  const points = [
    ...corners,
    ...corners,
    Math.floor(w / 2),
    (h - 1) * w + Math.floor(w / 2),
    Math.floor(h / 2) * w,
    Math.floor(h / 2) * w + w - 1,
  ];
  const colors = points.map((i) => [
    data[i * 4],
    data[i * 4 + 1],
    data[i * 4 + 2],
  ]);
  let bg = colors[0],
    best = Infinity;
  for (const a of colors) {
    const score = colors.reduce(
      (sum, b) => sum + Math.hypot(...a.map((v, i) => v - b[i])),
      0,
    );
    if (score < best) {
      best = score;
      bg = a;
    }
  }
  const dist = (i) =>
    Math.hypot(
      data[i * 4] - bg[0],
      data[i * 4 + 1] - bg[1],
      data[i * 4 + 2] - bg[2],
    );
  const removed = new Uint8Array(w * h);
  if (mode === "global") {
    for (let i = 0; i < w * h; i++) {
      if (dist(i) <= tolerance) {
        removed[i] = 1;
        data[i * 4 + 3] = 0;
      }
    }
  } else {
    const seen = new Uint8Array(w * h),
      q = new Uint32Array(w * h);
    let head = 0,
      tail = 0;
    const add = (i) => {
      if (i >= 0 && i < w * h && !seen[i]) {
        seen[i] = 1;
        if (dist(i) <= tolerance) q[tail++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      add(x);
      add((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      add(y * w);
      add(y * w + w - 1);
    }
    while (head < tail) {
      const i = q[head++];
      removed[i] = 1;
      data[i * 4 + 3] = 0;
      if (i % w) add(i - 1);
      if (i % w < w - 1) add(i + 1);
      if (i >= w) add(i - w);
      if (i < w * (h - 1)) add(i + w);
    }
  }
  const band = Math.max(0, Number(feather) || 0);
  if (band > 0) {
    const touchesRemoved = (i) => {
      const x = i % w,
        y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          if (nx >= 0 && nx < w && removed[ny * w + nx]) return true;
        }
      }
      return false;
    };
    for (let i = 0; i < w * h; i++) {
      if (removed[i]) continue;
      if (mode !== "global" && !touchesRemoved(i)) continue;
      const d = dist(i);
      if (d < tolerance + band) {
        const t = Math.max(0, Math.min(1, (d - tolerance) / band));
        const smooth = t * t * (3 - 2 * t);
        data[i * 4 + 3] = Math.round(data[i * 4 + 3] * smooth);
        if (smooth > 0.05 && smooth < 0.98) {
          for (let c = 0; c < 3; c++) {
            data[i * 4 + c] = Math.max(
              0,
              Math.min(
                255,
                Math.round((data[i * 4 + c] - bg[c] * (1 - smooth)) / smooth),
              ),
            );
          }
        }
      }
    }
  }
}
async function encode(c, format = "png", quality = 0.9) {
  if (format === "avif") {
    const { default: factory } = await import(asset("avif/avif_enc.js"));
    const { defaultOptions } = await import(asset("avif/meta.js"));
    const encoder = await factory({ locateFile: (p) => asset("avif/" + p) });
    const pixels = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    const bytes = encoder.encode(
      new Uint8Array(pixels.data.buffer),
      c.width,
      c.height,
      { ...defaultOptions, quality: Math.round(quality * 100), speed: 8 },
    );
    if (!bytes) throw new Error("Falha ao gerar AVIF / AVIF encoding failed.");
    return new Blob([bytes], { type: "image/avif" });
  }
  return toBlob(c, `image/${format}`, quality);
}
export async function run(id, files, o, ctx = {}) {
  const results = [];
  if (id === "collage-image") {
    const columns = Number(o.columns),
      cell = Number(o.cell),
      gap = Number(o.gap),
      rows = Math.ceil(files.length / columns);
    const c = canvas(
        columns * cell + (columns + 1) * gap,
        rows * cell + (rows + 1) * gap,
      ),
      g = c.getContext("2d");
    g.fillStyle = o.color;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < files.length; i++) {
      const img = await bitmap(files[i]),
        scale = Math.max(cell / img.width, cell / img.height);
      g.save();
      g.beginPath();
      g.rect(
        gap + (i % columns) * (cell + gap),
        gap + Math.floor(i / columns) * (cell + gap),
        cell,
        cell,
      );
      g.clip();
      g.drawImage(
        img,
        gap + (i % columns) * (cell + gap) + (cell - img.width * scale) / 2,
        gap +
          Math.floor(i / columns) * (cell + gap) +
          (cell - img.height * scale) / 2,
        img.width * scale,
        img.height * scale,
      );
      g.restore();
      img.close?.();
      progress(ctx, ((i + 1) / files.length) * 100);
      await tick();
    }
    return [output(await toBlob(c), "tinylab-colagem.png")];
  }
  for (let i = 0; i < files.length; i++) {
    check(ctx);
    const file = files[i];
    progress(ctx, (i / files.length) * 100);
    const img = await bitmap(file);
    try {
      let w = img.width,
        h = img.height,
        fmt = "png";
      if (id === "image-metadata") {
        const { default: exifr } = await import("exifr");
        let exif = null;
        try {
          exif = await exifr.parse(await file.arrayBuffer(), { gps: true });
        } catch {}
        results.push(
          textOutput(
            JSON.stringify(
              {
                name: file.name,
                type: file.type,
                bytes: file.size,
                width: w,
                height: h,
                exif,
              },
              null,
              2,
            ),
            `${baseName(file.name)}-metadata.json`,
            "application/json",
          ),
        );
        continue;
      }
      if (id === "resize-image") {
        if (Number(o.percent) > 0) {
          w = Math.round((w * o.percent) / 100);
          h = Math.round((h * o.percent) / 100);
        } else {
          const ratio = h / w;
          w = Number(o.width);
          h = Number(o.height) || Math.round(w * ratio);
        }
      }
      if (id === "compress-image" && w > Number(o.width)) {
        h = Math.round((h * o.width) / w);
        w = Number(o.width);
      }
      if (id === "upscale-image") {
        w *= Number(o.factor);
        h *= Number(o.factor);
      }
      if (id === "svg-to-png") {
        h = Number(o.height) || Math.round((h * Number(o.width)) / w);
        w = Number(o.width);
      }
      if (id === "rotate-image" && Number(o.angle) % 180) {
        [w, h] = [h, w];
      }
      if (id === "border-image") {
        w += 2 * Number(o.border);
        h += 2 * Number(o.border);
      }
      if (id === "round-image") {
        w = h = Math.min(w, h);
      }
      if (id === "crop-image") {
        const crop = o.crop || { x: 0, y: 0, w: 1, h: 1 };
        w = Math.max(1, Math.round(img.width * crop.w));
        h = Math.max(1, Math.round(img.height * crop.h));
      }
      const c = canvas(w, h),
        g = c.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      if (["compress-image", "convert-image"].includes(id))
        fmt = o.format || "webp";
      if (id === "heic-to-jpg") fmt = "jpeg";
      if (fmt === "jpeg") {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, w, h);
      }
      switch (id) {
        case "rotate-image":
          g.translate(w / 2, h / 2);
          g.rotate((Number(o.angle) * Math.PI) / 180);
          g.drawImage(img, -img.width / 2, -img.height / 2);
          break;
        case "flip-image":
          g.translate(
            o.axis === "horizontal" ? w : 0,
            o.axis === "vertical" ? h : 0,
          );
          g.scale(
            o.axis === "horizontal" ? -1 : 1,
            o.axis === "vertical" ? -1 : 1,
          );
          g.drawImage(img, 0, 0);
          break;
        case "border-image":
          g.fillStyle = o.color;
          g.fillRect(0, 0, w, h);
          g.drawImage(img, Number(o.border), Number(o.border));
          break;
        case "round-image":
          g.beginPath();
          g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
          g.clip();
          g.drawImage(img, (w - img.width) / 2, (h - img.height) / 2);
          break;
        case "crop-image": {
          const a = o.crop || { x: 0, y: 0, w: 1, h: 1 };
          g.drawImage(
            img,
            img.width * a.x,
            img.height * a.y,
            img.width * a.w,
            img.height * a.h,
            0,
            0,
            w,
            h,
          );
          break;
        }
        case "pixelate-image": {
          const b = Math.max(2, Number(o.block)),
            tiny = canvas(
              Math.max(1, Math.ceil(w / b)),
              Math.max(1, Math.ceil(h / b)),
            );
          tiny.getContext("2d").drawImage(img, 0, 0, tiny.width, tiny.height);
          g.imageSmoothingEnabled = false;
          g.drawImage(tiny, 0, 0, w, h);
          break;
        }
        default:
          if (id === "adjust-image")
            g.filter = `brightness(${o.brightness}%) contrast(${o.contrast}%) saturate(${o.saturation}%) grayscale(${o.grayscale}%)`;
          if (id === "blur-image") g.filter = `blur(${o.radius}px)`;
          g.drawImage(img, 0, 0, w, h);
          g.filter = "none";
      }
      if (id === "remove-bg") {
        const pixels = g.getImageData(0, 0, w, h);
        removeBackground(
          pixels.data,
          w,
          h,
          Number(o.tolerance),
          o.mode,
          Number(o.feather ?? 18),
        );
        g.putImageData(pixels, 0, 0);
        if (o.fill === "color" && o.bgColor) {
          g.save();
          g.globalCompositeOperation = "destination-over";
          g.fillStyle = o.bgColor;
          g.fillRect(0, 0, w, h);
          g.restore();
        }
      }
      if (id === "image-text" || id === "watermark-image") {
        g.save();
        g.fillStyle = o.color;
        g.globalAlpha = id === "watermark-image" ? Number(o.opacity) / 100 : 1;
        g.textAlign = "center";
        g.font = `600 ${Number(o.fontSize)}px sans-serif`;
        const lines = String(o.content || "").split("\n"),
          lh = Number(o.fontSize) * 1.3;
        let y =
          o.position === "top"
            ? lh
            : o.position === "center"
              ? h / 2
              : h - lh * lines.length;
        for (const line of lines) {
          g.fillText(line, w / 2, y, w * 0.92);
          y += lh;
        }
        g.restore();
      }
      if (id === "favicon-maker") {
        const outputs = [];
        for (const s of [16, 32, 48, 96, 180, 192, 512]) {
          const cc = canvas(s, s);
          cc.getContext("2d").drawImage(img, 0, 0, s, s);
          const blob = await toBlob(cc);
          outputs.push(output(blob, `icon-${s}.png`));
          if (s === 32) {
            const bytes = new Uint8Array(await blob.arrayBuffer()),
              header = new ArrayBuffer(22),
              v = new DataView(header);
            v.setUint16(2, 1, true);
            v.setUint16(4, 1, true);
            v.setUint8(6, 32);
            v.setUint8(7, 32);
            v.setUint16(10, 1, true);
            v.setUint16(12, 32, true);
            v.setUint32(14, bytes.length, true);
            v.setUint32(18, 22, true);
            outputs.push(
              output(
                new Blob([header, bytes], { type: "image/x-icon" }),
                "favicon.ico",
              ),
            );
          }
        }
        results.push(
          await zipOutputs(outputs, `${baseName(file.name)}-icons.zip`, ctx),
        );
      } else {
        const blob = await encode(c, fmt, Number(o.quality || 90) / 100);
        results.push({
          ...output(
            blob,
            `${baseName(file.name)}-${id}.${fmt === "jpeg" ? "jpg" : fmt}`,
          ),
          width: w,
          height: h,
          originalSize: file.size,
        });
      }
      await tick();
    } finally {
      img.close?.();
    }
  }
  progress(ctx, 100);
  return results;
}
