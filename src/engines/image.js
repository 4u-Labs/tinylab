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
export function inpaintImage(data, rawMask, w, h, passes = 14) {
  const n = w * h;
  const mask = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!rawMask[idx]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && dx * dx + dy * dy <= 5) {
            mask[ny * w + nx] = 1;
          }
        }
      }
    }
  }
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = mask[i] ? 0 : 1;
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  const inQueue = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (
        (x > 0 && known[i - 1]) ||
        (x < w - 1 && known[i + 1]) ||
        (y > 0 && known[i - w]) ||
        (y < h - 1 && known[i + w])
      ) {
        queue[tail++] = i;
        inQueue[i] = 1;
      }
    }
  }
  const maskedIndices = [];
  while (head < tail) {
    const i = queue[head++];
    maskedIndices.push(i);
    const x = i % w,
      y = (i - x) / w;
    let r = 0,
      g = 0,
      b = 0,
      a = 0,
      wSum = 0;
    for (let dy = -3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -3; dx <= 3; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (known[j]) {
          const wt = 1 / (dx * dx + dy * dy);
          r += data[j * 4] * wt;
          g += data[j * 4 + 1] * wt;
          b += data[j * 4 + 2] * wt;
          a += data[j * 4 + 3] * wt;
          wSum += wt;
        }
      }
    }
    if (wSum > 0) {
      data[i * 4] = Math.round(r / wSum);
      data[i * 4 + 1] = Math.round(g / wSum);
      data[i * 4 + 2] = Math.round(b / wSum);
      data[i * 4 + 3] = Math.round(a / wSum);
    }
    known[i] = 1;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (!known[ni] && !inQueue[ni]) {
        inQueue[ni] = 1;
        queue[tail++] = ni;
      }
    }
  }
  const buf = new Float32Array(maskedIndices.length * 3);
  for (let p = 0; p < passes; p++) {
    for (let k = 0; k < maskedIndices.length; k++) {
      const i = maskedIndices[k];
      const x = i % w,
        y = (i - x) / w;
      let r = 0,
        g = 0,
        b = 0,
        wtSum = 0;
      for (const [dx, dy, wt] of [
        [-1, 0, 1],
        [1, 0, 1],
        [0, -1, 1],
        [0, 1, 1],
        [-1, -1, 0.5],
        [1, -1, 0.5],
        [-1, 1, 0.5],
        [1, 1, 0.5],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const j = ny * w + nx;
        r += data[j * 4] * wt;
        g += data[j * 4 + 1] * wt;
        b += data[j * 4 + 2] * wt;
        wtSum += wt;
      }
      if (wtSum > 0) {
        buf[k * 3] = r / wtSum;
        buf[k * 3 + 1] = g / wtSum;
        buf[k * 3 + 2] = b / wtSum;
      }
    }
    for (let k = 0; k < maskedIndices.length; k++) {
      const i = maskedIndices[k];
      data[i * 4] = Math.round(buf[k * 3]);
      data[i * 4 + 1] = Math.round(buf[k * 3 + 1]);
      data[i * 4 + 2] = Math.round(buf[k * 3 + 2]);
    }
  }
  return data;
}

function rdpSimplify(pts, eps) {
  if (pts.length <= 3) return pts;
  let maxDist = 0,
    idx = 0;
  const [x1, y1] = pts[0],
    [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1,
    dy = y2 - y1,
    lenSq = dx * dx + dy * dy;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    let dSq;
    if (lenSq === 0) {
      dSq = (px - x1) ** 2 + (py - y1) ** 2;
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      dSq = (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2;
    }
    if (dSq > maxDist) {
      maxDist = dSq;
      idx = i;
    }
  }
  if (Math.sqrt(maxDist) > eps) {
    const left = rdpSimplify(pts.slice(0, idx + 1), eps);
    const right = rdpSimplify(pts.slice(idx), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

function traceMaskRings(mask, w, h, eps = 1.1) {
  const segsByStart = new Map();
  const keyOf = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const addSeg = (x1, y1, x2, y2) => {
    const k = keyOf(x1, y1);
    let arr = segsByStart.get(k);
    if (!arr) {
      arr = [];
      segsByStart.set(k, arr);
    }
    arr.push({ x1, y1, x2, y2, used: false });
  };
  const at = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? mask[y * w + x] : 0);
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y),
        tr = at(x + 1, y),
        br = at(x + 1, y + 1),
        bl = at(x, y + 1);
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;
      const top = [x + 1, y + 0.5],
        right = [x + 1.5, y + 1],
        bottom = [x + 1, y + 1.5],
        left = [x + 0.5, y + 1];
      switch (code) {
        case 1:
          addSeg(...left, ...bottom);
          break;
        case 2:
          addSeg(...bottom, ...right);
          break;
        case 3:
          addSeg(...left, ...right);
          break;
        case 4:
          addSeg(...right, ...top);
          break;
        case 5:
          addSeg(...left, ...top);
          addSeg(...bottom, ...right);
          break;
        case 6:
          addSeg(...bottom, ...top);
          break;
        case 7:
          addSeg(...left, ...top);
          break;
        case 8:
          addSeg(...top, ...left);
          break;
        case 9:
          addSeg(...top, ...bottom);
          break;
        case 10:
          addSeg(...top, ...right);
          addSeg(...bottom, ...left);
          break;
        case 11:
          addSeg(...top, ...right);
          break;
        case 12:
          addSeg(...right, ...left);
          break;
        case 13:
          addSeg(...right, ...bottom);
          break;
        case 14:
          addSeg(...bottom, ...left);
          break;
      }
    }
  }
  const rings = [];
  for (const list of segsByStart.values()) {
    for (const first of list) {
      if (first.used) continue;
      first.used = true;
      const pts = [
        [first.x1 - 0.5, first.y1 - 0.5],
        [first.x2 - 0.5, first.y2 - 0.5],
      ];
      let curX = first.x2,
        curY = first.y2;
      let guard = 0;
      while (guard++ < w * h * 4) {
        if (Math.abs(curX - first.x1) < 0.01 && Math.abs(curY - first.y1) < 0.01)
          break;
        const candidates = segsByStart.get(keyOf(curX, curY));
        const next = candidates?.find((s) => !s.used);
        if (!next) break;
        next.used = true;
        pts.push([next.x2 - 0.5, next.y2 - 0.5]);
        curX = next.x2;
        curY = next.y2;
      }
      if (pts.length >= 4) {
        let area = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
        }
        if (Math.abs(area) * 0.5 >= 2) {
          const simp = rdpSimplify(pts, eps);
          if (simp.length >= 3) rings.push(simp);
        }
      }
    }
  }
  return rings;
}

export function vectorizeToSvg(data, origW, origH, o = {}) {
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(origW, origH));
  const w = Math.max(2, Math.round(origW * scale));
  const h = Math.max(2, Math.round(origH * scale));
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(origH - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(origW - 1, Math.floor(x / scale));
      const si = (sy * origW + sx) * 4;
      const di = (y * w + x) * 4;
      rgba[di] = data[si];
      rgba[di + 1] = data[si + 1];
      rgba[di + 2] = data[si + 2];
      rgba[di + 3] = data[si + 3];
    }
  }
  const eps =
    o.detail === "high" ? 0.65 : o.detail === "smooth" ? 2.0 : 1.15;
  const sxFactor = origW / w,
    syFactor = origH / h;
  const fmtNum = (v) => Number(v.toFixed(1));
  const ringsToPath = (rings) =>
    rings
      .map((pts) => {
        if (o.detail === "smooth" && pts.length >= 5) {
          const closed = pts.slice(0, -1);
          const m0x = fmtNum(((closed[0][0] + closed.at(-1)[0]) / 2) * sxFactor);
          const m0y = fmtNum(((closed[0][1] + closed.at(-1)[1]) / 2) * syFactor);
          let cmd = `M${m0x} ${m0y}`;
          for (let i = 0; i < closed.length; i++) {
            const cur = closed[i],
              nxt = closed[(i + 1) % closed.length];
            const mx = fmtNum(((cur[0] + nxt[0]) / 2) * sxFactor);
            const my = fmtNum(((cur[1] + nxt[1]) / 2) * syFactor);
            cmd += `Q${fmtNum(cur[0] * sxFactor)} ${fmtNum(cur[1] * syFactor)} ${mx} ${my}`;
          }
          return cmd + "Z";
        }
        return (
          pts
            .map(
              ([px, py], idx) =>
                `${idx === 0 ? "M" : "L"}${fmtNum(px * sxFactor)} ${fmtNum(py * syFactor)}`,
            )
            .join("") + "Z"
        );
      })
      .join("");

  const paths = [];
  if (o.mode === "mono") {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = rgba[i * 4 + 3];
      const lum =
        0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
      mask[i] = a >= 64 && lum < 145 ? 1 : 0;
    }
    const d = ringsToPath(traceMaskRings(mask, w, h, eps));
    if (d) paths.push(`<path fill="#111111" fill-rule="evenodd" d="${d}"/>`);
  } else {
    const kCount = Math.max(2, Math.min(12, Number(o.colors || 6)));
    const samples = [];
    const stride = Math.max(1, Math.floor((w * h) / 4000));
    for (let i = 0; i < w * h; i += stride) {
      if (rgba[i * 4 + 3] >= 64) {
        samples.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
      }
    }
    if (samples.length) {
      const centroids = [];
      for (let k = 0; k < Math.min(kCount, samples.length); k++) {
        centroids.push([...samples[Math.floor((k * samples.length) / kCount)]]);
      }
      for (let iter = 0; iter < 8; iter++) {
        const sums = centroids.map(() => [0, 0, 0, 0]);
        for (const s of samples) {
          let best = 0,
            bestD = Infinity;
          for (let c = 0; c < centroids.length; c++) {
            const d =
              (s[0] - centroids[c][0]) ** 2 +
              (s[1] - centroids[c][1]) ** 2 +
              (s[2] - centroids[c][2]) ** 2;
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          sums[best][0] += s[0];
          sums[best][1] += s[1];
          sums[best][2] += s[2];
          sums[best][3]++;
        }
        for (let c = 0; c < centroids.length; c++) {
          if (sums[c][3] > 0) {
            centroids[c][0] = Math.round(sums[c][0] / sums[c][3]);
            centroids[c][1] = Math.round(sums[c][1] / sums[c][3]);
            centroids[c][2] = Math.round(sums[c][2] / sums[c][3]);
          }
        }
      }
      const labels = new Int16Array(w * h).fill(-1);
      for (let i = 0; i < w * h; i++) {
        if (rgba[i * 4 + 3] < 64) continue;
        let best = 0,
          bestD = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d =
            (rgba[i * 4] - centroids[c][0]) ** 2 +
            (rgba[i * 4 + 1] - centroids[c][1]) ** 2 +
            (rgba[i * 4 + 2] - centroids[c][2]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        labels[i] = best;
      }
      const order = centroids
        .map((rgb, idx) => ({
          idx,
          rgb,
          count: labels.reduce((s, v) => s + (v === idx ? 1 : 0), 0),
          touchesBorder: (() => {
            for (let x = 0; x < w; x++)
              if (labels[x] === idx || labels[(h - 1) * w + x] === idx) return true;
            for (let y = 0; y < h; y++)
              if (labels[y * w] === idx || labels[y * w + w - 1] === idx) return true;
            return false;
          })(),
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count);

      for (const layer of order) {
        const [r, g, b] = layer.rgb;
        if (
          o.ignoreWhite !== "no" &&
          layer.touchesBorder &&
          r >= 242 &&
          g >= 242 &&
          b >= 242
        ) {
          continue;
        }
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = labels[i] === layer.idx ? 1 : 0;
        const d = ringsToPath(traceMaskRings(mask, w, h, eps));
        if (d) {
          const hex =
            "#" +
            [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
          paths.push(`<path fill="${hex}" fill-rule="evenodd" d="${d}"/>`);
        }
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${origW} ${origH}" width="${origW}" height="${origH}">\n${paths.join("\n")}\n</svg>`;
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
      if (id === "split-image") {
        const presetMap = {
          "carousel-3": [3, 1],
          "carousel-5": [5, 1],
          "grid-3x3": [3, 3],
          "grid-3x2": [3, 2],
        };
        const [cols, rows] = presetMap[o.preset] || [
          Math.max(1, Math.min(12, Number(o.columns || 3))),
          Math.max(1, Math.min(12, Number(o.rows || 1))),
        ];
        const outFmt = o.format || "png";
        const tileW = Math.max(1, Math.floor(w / cols));
        const tileH = Math.max(1, Math.floor(h / rows));
        let idx = 1;
        for (let r = 0; r < rows; r++) {
          for (let col = 0; col < cols; col++) {
            const tc = canvas(tileW, tileH),
              tg = tc.getContext("2d");
            if (outFmt === "jpeg") {
              tg.fillStyle = "#fff";
              tg.fillRect(0, 0, tileW, tileH);
            }
            tg.drawImage(
              img,
              col * tileW,
              r * tileH,
              tileW,
              tileH,
              0,
              0,
              tileW,
              tileH,
            );
            const blob = await encode(tc, outFmt, 0.92);
            const ext = outFmt === "jpeg" ? "jpg" : outFmt;
            results.push(
              output(
                blob,
                `${baseName(file.name)}-${String(idx++).padStart(2, "0")}.${ext}`,
              ),
            );
          }
        }
        continue;
      }
      if (id === "image-to-svg") {
        const sc = canvas(w, h),
          sg = sc.getContext("2d");
        sg.drawImage(img, 0, 0, w, h);
        const px = sg.getImageData(0, 0, w, h);
        const svg = vectorizeToSvg(px.data, w, h, o);
        results.push(
          output(
            new Blob([svg], { type: "image/svg+xml" }),
            `${baseName(file.name)}.svg`,
            svg,
          ),
        );
        continue;
      }
      if (id === "remove-object") {
        if (!o.maskBytes)
          throw new Error(
            "Pinte sobre o objeto ou marca-d’água na prévia antes de processar / Paint over the unwanted object on the preview first.",
          );
        const cObj = canvas(w, h),
          gObj = cObj.getContext("2d");
        gObj.drawImage(img, 0, 0, w, h);
        const maskBmp = await bitmap(
          new Blob([o.maskBytes], { type: "image/png" }),
        );
        const mc = canvas(w, h),
          mg = mc.getContext("2d");
        mg.drawImage(maskBmp, 0, 0, w, h);
        maskBmp.close?.();
        const maskData = mg.getImageData(0, 0, w, h).data;
        const binMask = new Uint8Array(w * h);
        let painted = 0;
        for (let k = 0; k < w * h; k++) {
          if (maskData[k * 4 + 3] > 20) {
            binMask[k] = 1;
            painted++;
          }
        }
        if (!painted)
          throw new Error(
            "Pinte sobre a área que deseja remover / Paint over the area to remove.",
          );
        const px = gObj.getImageData(0, 0, w, h);
        inpaintImage(px.data, binMask, w, h, 16);
        gObj.putImageData(px, 0, 0);
        const blob = await toBlob(cObj, "image/png");
        results.push({
          ...output(blob, `${baseName(file.name)}-clean.png`),
          width: w,
          height: h,
          originalSize: file.size,
        });
        continue;
      }
      if (id === "pfp-maker") {
        const S = 1024;
        const pfp = canvas(S, S),
          pg = pfp.getContext("2d");
        const ring = Math.max(0, Math.min(80, Number(o.ring ?? 24)));
        const shapePath = (ctx2d, inset = 0) => {
          const side = S - inset * 2;
          ctx2d.beginPath();
          if (o.shape === "square") {
            ctx2d.rect(inset, inset, side, side);
          } else if (o.shape === "squircle") {
            const r = side * 0.24;
            ctx2d.roundRect(inset, inset, side, side, r);
          } else {
            ctx2d.arc(S / 2, S / 2, side / 2, 0, Math.PI * 2);
          }
        };
        const subj = canvas(S, S),
          sg = subj.getContext("2d");
        const sc = Math.max(S / w, S / h);
        sg.drawImage(
          img,
          (S - w * sc) / 2,
          (S - h * sc) / 2,
          w * sc,
          h * sc,
        );
        if (o.cutout !== "keep") {
          const px = sg.getImageData(0, 0, S, S);
          let hasAlpha = false;
          for (let k = 3; k < px.data.length; k += 64) {
            if (px.data[k] < 245) {
              hasAlpha = true;
              break;
            }
          }
          if (!hasAlpha) {
            removeBackground(px.data, S, S, 42, "outer", 20);
            sg.putImageData(px, 0, 0);
          }
        }
        pg.save();
        shapePath(pg, ring > 0 ? ring / 2 : 0);
        pg.clip();
        if (o.bgStyle !== "outline") {
          if (o.bgStyle === "solid") {
            pg.fillStyle = o.color || "#7928ca";
          } else {
            const grad = pg.createLinearGradient(0, 0, S, S);
            grad.addColorStop(0, o.color || "#7928ca");
            grad.addColorStop(1, o.accentColor || "#00dfd8");
            pg.fillStyle = grad;
          }
          pg.fillRect(0, 0, S, S);
        }
        pg.shadowColor = "rgba(0,0,0,0.36)";
        pg.shadowBlur = 28;
        pg.shadowOffsetY = 12;
        pg.drawImage(subj, 0, 0);
        pg.restore();
        if (ring > 0) {
          pg.save();
          shapePath(pg, ring / 2);
          const rGrad = pg.createLinearGradient(0, 0, S, S);
          rGrad.addColorStop(0, o.accentColor || "#00dfd8");
          rGrad.addColorStop(1, o.color || "#7928ca");
          pg.strokeStyle = rGrad;
          pg.lineWidth = ring;
          pg.stroke();
          pg.restore();
        }
        results.push(
          output(await toBlob(pfp, "image/png"), `${baseName(file.name)}-pfp.png`),
        );
        continue;
      }
      if (id === "meme-mockup") {
        const pad = Math.max(16, Math.min(200, Number(o.padding ?? 64)));
        const topTxt = String(o.topText || "").trim();
        const botTxt = String(o.bottomText || "").trim();
        const wrapCanvasLines = (ctx2d, str, maxW) => {
          if (!str) return [];
          const out = [];
          for (const rawLine of str.split("\n")) {
            let cur = "";
            for (const word of rawLine.split(/\s+/)) {
              const test = cur ? `${cur} ${word}` : word;
              if (cur && ctx2d.measureText(test).width > maxW) {
                out.push(cur);
                cur = word;
              } else {
                cur = test;
              }
            }
            if (cur) out.push(cur);
          }
          return out;
        };
        if (o.style === "mockup") {
          const barH = 40;
          const mw = w + pad * 2,
            mh = h + barH + pad * 2;
          const mc = canvas(mw, mh),
            mg = mc.getContext("2d");
          const grad = mg.createLinearGradient(0, 0, mw, mh);
          grad.addColorStop(0, o.color || "#7928ca");
          grad.addColorStop(1, o.accentColor || "#0e7490");
          mg.fillStyle = grad;
          mg.fillRect(0, 0, mw, mh);
          const rad = 14;
          mg.save();
          mg.shadowColor = "rgba(0,0,0,0.48)";
          mg.shadowBlur = Math.max(24, pad * 0.65);
          mg.shadowOffsetY = Math.round(pad * 0.25);
          mg.fillStyle = "#16161f";
          mg.beginPath();
          mg.roundRect(pad, pad, w, h + barH, rad);
          mg.fill();
          mg.restore();
          mg.save();
          mg.beginPath();
          mg.roundRect(pad, pad, w, h + barH, rad);
          mg.clip();
          mg.fillStyle = "#1d1c27";
          mg.fillRect(pad, pad, w, barH);
          [
            ["#ff5f57", 20],
            ["#febc2e", 40],
            ["#28c840", 60],
          ].forEach(([clr, dx]) => {
            mg.fillStyle = clr;
            mg.beginPath();
            mg.arc(pad + dx, pad + barH / 2, 6, 0, Math.PI * 2);
            mg.fill();
          });
          if (topTxt) {
            mg.fillStyle = "#a8a4b7";
            mg.font = "500 13px sans-serif";
            mg.textAlign = "center";
            mg.textBaseline = "middle";
            mg.fillText(topTxt, pad + w / 2, pad + barH / 2, Math.max(60, w - 160));
          }
          mg.drawImage(img, pad, pad + barH, w, h);
          mg.restore();
          results.push(
            output(
              await toBlob(mc, "image/png"),
              `${baseName(file.name)}-mockup.png`,
            ),
          );
          continue;
        }
        if (o.style === "caption") {
          const capText = [topTxt, botTxt].filter(Boolean).join(" — ") || "TinyLab";
          const fSize = Math.max(20, Math.round(w * 0.048));
          const tmp = canvas(10, 10).getContext("2d");
          tmp.font = `700 ${fSize}px sans-serif`;
          const lines = wrapCanvasLines(tmp, capText, w * 0.9);
          const capH = Math.max(fSize * 2, lines.length * fSize * 1.32 + fSize * 0.9);
          const mc = canvas(w, h + Math.round(capH)),
            mg = mc.getContext("2d");
          mg.fillStyle = "#ffffff";
          mg.fillRect(0, 0, mc.width, mc.height);
          mg.fillStyle = "#111116";
          mg.font = `700 ${fSize}px sans-serif`;
          mg.textAlign = "center";
          mg.textBaseline = "top";
          lines.forEach((ln, idx) => {
            mg.fillText(ln, w / 2, fSize * 0.45 + idx * fSize * 1.32, w * 0.92);
          });
          mg.drawImage(img, 0, Math.round(capH), w, h);
          results.push(
            output(
              await toBlob(mc, "image/png"),
              `${baseName(file.name)}-meme.png`,
            ),
          );
          continue;
        }
        const mc = canvas(w, h),
          mg = mc.getContext("2d");
        mg.drawImage(img, 0, 0, w, h);
        const fSize = Math.max(22, Math.round(Math.min(w, h) * 0.085));
        mg.font = `900 ${fSize}px Impact, "Arial Black", sans-serif`;
        mg.textAlign = "center";
        mg.lineJoin = "round";
        mg.lineWidth = Math.max(4, Math.round(fSize * 0.16));
        mg.strokeStyle = "#000000";
        mg.fillStyle = "#ffffff";
        const topLines = wrapCanvasLines(mg, topTxt.toUpperCase(), w * 0.92);
        topLines.forEach((ln, idx) => {
          const yPos = fSize * 1.05 + idx * fSize * 1.15;
          mg.strokeText(ln, w / 2, yPos, w * 0.94);
          mg.fillText(ln, w / 2, yPos, w * 0.94);
        });
        const botLines = wrapCanvasLines(mg, botTxt.toUpperCase(), w * 0.92);
        botLines.forEach((ln, idx) => {
          const yPos =
            h - fSize * 0.38 - (botLines.length - 1 - idx) * fSize * 1.15;
          mg.strokeText(ln, w / 2, yPos, w * 0.94);
          mg.fillText(ln, w / 2, yPos, w * 0.94);
        });
        results.push(
          output(
            await toBlob(mc, "image/png"),
            `${baseName(file.name)}-meme.png`,
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
