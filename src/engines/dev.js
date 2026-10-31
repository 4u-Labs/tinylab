import {
  textOutput,
  output,
  toBlob,
  canvas,
  progress,
  baseName,
} from "../utils.js";
export function crc16(s) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(s)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const tlv = (id, value) =>
  `${id}${String(new TextEncoder().encode(value).length).padStart(2, "0")}${value}`;
export function pixPayload(key, merchant, city, amount = 0) {
  key = String(key).trim();
  if (!key || new TextEncoder().encode(key).length > 77)
    throw new Error("Chave PIX inválida / Invalid PIX key.");
  const clean = (s, max) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .slice(0, max);
  let payload =
    tlv("00", "01") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key)) +
    tlv("52", "0000") +
    tlv("53", "986");
  if (Number(amount) > 0) payload += tlv("54", Number(amount).toFixed(2));
  payload +=
    tlv("58", "BR") +
    tlv("59", clean(merchant, 25) || "RECEBEDOR") +
    tlv("60", clean(city, 15) || "SAO PAULO") +
    tlv("62", tlv("05", "***")) +
    "6304";
  return payload + crc16(payload);
}
export function password(length, mode = "all") {
  length = Number(length);
  if (!Number.isInteger(length) || length < 8 || length > 128)
    throw new Error("Tamanho inválido / Invalid length.");
  const sets =
    mode === "digits"
      ? ["0123456789"]
      : mode === "alnum"
        ? [
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "abcdefghijklmnopqrstuvwxyz",
            "0123456789",
          ]
        : [
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "abcdefghijklmnopqrstuvwxyz",
            "0123456789",
            "!@#$%^&*()_+-=[]{}:,.?",
          ];
  const chars = sets.join("");
  function rnd(max) {
    const cap = Math.floor(256 / max) * max;
    const b = new Uint8Array(1);
    do {
      crypto.getRandomValues(b);
    } while (b[0] >= cap);
    return b[0] % max;
  }
  const arr = sets.map((s) => s[rnd(s.length)]);
  while (arr.length < length) arr.push(chars[rnd(chars.length)]);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN13_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

function eanCheckDigit(digits) {
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const weight = (len - 1 - i) % 2 === 0 ? 3 : 1;
    sum += Number(digits[i]) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

export function encodeBarcode(rawValue, format = "CODE128") {
  const val = String(rawValue || "").trim();
  if (!val) throw new Error("Informe o código / Enter barcode value.");
  if (format === "EAN13") {
    if (!/^\d{12,13}$/.test(val))
      throw new Error(
        "EAN-13 requer 12 ou 13 dígitos numéricos / EAN-13 requires 12 or 13 digits.",
      );
    const base12 = val.slice(0, 12);
    const chk = eanCheckDigit(base12);
    if (val.length === 13 && val[12] !== chk)
      throw new Error(
        `Dígito verificador inválido (esperado ${chk}) / Invalid check digit (expected ${chk}).`,
      );
    const full = base12 + chk;
    const parity = EAN13_PARITY[Number(full[0])];
    let bits = "101";
    for (let i = 0; i < 6; i++) {
      const d = Number(full[i + 1]);
      bits += parity[i] === "G" ? EAN_G[d] : EAN_L[d];
    }
    bits += "01010";
    for (let i = 0; i < 6; i++) bits += EAN_R[Number(full[i + 7])];
    bits += "101";
    return { bits, label: full, format: "EAN13" };
  }
  if (format === "EAN8") {
    if (!/^\d{7,8}$/.test(val))
      throw new Error(
        "EAN-8 requer 7 ou 8 dígitos numéricos / EAN-8 requires 7 or 8 digits.",
      );
    const base7 = val.slice(0, 7);
    const chk = eanCheckDigit(base7);
    if (val.length === 8 && val[7] !== chk)
      throw new Error(
        `Dígito verificador inválido (esperado ${chk}) / Invalid check digit (expected ${chk}).`,
      );
    const full = base7 + chk;
    let bits = "101";
    for (let i = 0; i < 4; i++) bits += EAN_L[Number(full[i])];
    bits += "01010";
    for (let i = 4; i < 8; i++) bits += EAN_R[Number(full[i])];
    bits += "101";
    return { bits, label: full, format: "EAN8" };
  }
  for (let i = 0; i < val.length; i++) {
    const code = val.charCodeAt(i);
    if (code < 32 || code > 126)
      throw new Error(
        "Code 128 aceita caracteres ASCII imprimíveis (32–126) / Code 128 accepts printable ASCII (32–126).",
      );
  }
  const codes = [104];
  let checksum = 104;
  for (let i = 0; i < val.length; i++) {
    const v = val.charCodeAt(i) - 32;
    codes.push(v);
    checksum += (i + 1) * v;
  }
  codes.push(checksum % 103, 106);
  let bits = "";
  for (const c of codes) {
    const pat = CODE128_PATTERNS[c];
    for (let j = 0; j < pat.length; j++) {
      bits += (j % 2 === 0 ? "1" : "0").repeat(Number(pat[j]));
    }
  }
  return { bits, label: val, format: "CODE128" };
}

export function buildBarcodeSvg(
  encoded,
  { color = "#111111", background = "#ffffff", showText = true } = {},
) {
  const { bits, label } = encoded;
  const quiet = 12,
    modW = 3,
    barH = 110,
    textH = showText ? 28 : 0,
    padY = 16;
  const totalW = (bits.length + quiet * 2) * modW;
  const totalH = barH + textH + padY * 2;
  const rects = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      rects.push(
        `<rect x="${(quiet + i) * modW}" y="${padY}" width="${(j - i) * modW}" height="${barH}" fill="${color}"/>`,
      );
      i = j;
    } else i++;
  }
  const safeLabel = String(label).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
  const caption = showText
    ? `<text x="${totalW / 2}" y="${padY + barH + 21}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="16" font-weight="600" fill="${color}">${safeLabel}</text>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">\n<rect width="${totalW}" height="${totalH}" fill="${background}"/>\n${rects.join("\n")}\n${caption}\n</svg>`;
}

export function decodeBarcode1DFromRgba(rgba, w, h) {
  const rowYs = [0.5, 0.4, 0.6, 0.3, 0.7].map((f) =>
    Math.min(h - 1, Math.max(0, Math.floor(h * f))),
  );
  const patToVal = new Map(CODE128_PATTERNS.map((p, idx) => [p, idx]));
  const lMap = new Map(EAN_L.map((b, i) => [b, ["L", i]]));
  const gMap = new Map(EAN_G.map((b, i) => [b, ["G", i]]));
  const rMap = new Map(EAN_R.map((b, i) => [b, i]));

  for (const y of rowYs) {
    let minL = 255,
      maxL = 0;
    const lum = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = rgba[idx + 3] / 255;
      const v = Math.round(
        (0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]) * a +
          255 * (1 - a),
      );
      lum[x] = v;
      if (v < minL) minL = v;
      if (v > maxL) maxL = v;
    }
    if (maxL - minL < 40) continue;
    const thr = (minL + maxL) / 2;
    const runs = [];
    let curBit = lum[0] < thr ? 1 : 0,
      count = 1;
    for (let x = 1; x < w; x++) {
      const bit = lum[x] < thr ? 1 : 0;
      if (bit === curBit) count++;
      else {
        runs.push({ bit: curBit, len: count });
        curBit = bit;
        count = 1;
      }
    }
    runs.push({ bit: curBit, len: count });
    const firstBar = runs.findIndex((r) => r.bit === 1);
    if (firstBar < 0) continue;
    let lastBar = runs.length - 1;
    while (lastBar >= 0 && runs[lastBar].bit !== 1) lastBar--;
    const barRuns = runs.slice(firstBar, lastBar + 1);

    // 1. Try Code 128B (6n + 7 runs)
    if (barRuns.length >= 19 && (barRuns.length - 7) % 6 === 0) {
      const nSyms = (barRuns.length - 7) / 6;
      const codes = [];
      let ok = true;
      for (let s = 0; s < nSyms; s++) {
        const seg = barRuns.slice(s * 6, s * 6 + 6);
        const total = seg.reduce((acc, r) => acc + r.len, 0);
        const widths = seg.map((r) =>
          Math.max(1, Math.min(4, Math.round((r.len * 11) / total))),
        );
        const v = patToVal.get(widths.join(""));
        if (v === undefined) {
          ok = false;
          break;
        }
        codes.push(v);
      }
      if (ok && codes[0] === 104 && codes.length >= 3) {
        const stopSeg = barRuns.slice(nSyms * 6, nSyms * 6 + 7);
        const stopTotal = stopSeg.reduce((acc, r) => acc + r.len, 0);
        const stopW = stopSeg
          .map((r) => Math.max(1, Math.min(4, Math.round((r.len * 13) / stopTotal))))
          .join("");
        const dataCodes = codes.slice(1, -1);
        const expectedChk =
          (104 + dataCodes.reduce((s, c, idx) => s + (idx + 1) * c, 0)) % 103;
        if (stopW === "2331112" && codes.at(-1) === expectedChk) {
          return {
            format: "CODE_128",
            value: dataCodes.map((c) => String.fromCharCode(c + 32)).join(""),
          };
        }
      }
    }

    // 2. Try EAN-13 (95 modules) or EAN-8 (67 modules)
    const totalPx = barRuns.reduce((acc, r) => acc + r.len, 0);
    for (const modTotal of [95, 67]) {
      const unit = totalPx / modTotal;
      if (unit < 0.8) continue;
      let bitStr = "";
      for (const r of barRuns) {
        bitStr += String(r.bit).repeat(Math.max(1, Math.round(r.len / unit)));
      }
      if (
        bitStr.length === 95 &&
        bitStr.startsWith("101") &&
        bitStr.slice(45, 50) === "01010" &&
        bitStr.endsWith("101")
      ) {
        let par = "",
          digits = "";
        let valid = true;
        for (let i = 0; i < 6; i++) {
          const chunk = bitStr.slice(3 + i * 7, 10 + i * 7);
          const hit = lMap.get(chunk) || gMap.get(chunk);
          if (!hit) {
            valid = false;
            break;
          }
          par += hit[0];
          digits += String(hit[1]);
        }
        const firstDigit = EAN13_PARITY.indexOf(par);
        if (valid && firstDigit >= 0) {
          for (let i = 0; i < 6; i++) {
            const chunk = bitStr.slice(50 + i * 7, 57 + i * 7);
            const rd = rMap.get(chunk);
            if (rd === undefined) {
              valid = false;
              break;
            }
            digits += String(rd);
          }
          const full = String(firstDigit) + digits;
          if (valid && eanCheckDigit(full.slice(0, 12)) === full[12]) {
            return { format: "EAN_13", value: full };
          }
        }
      }
      if (
        bitStr.length === 67 &&
        bitStr.startsWith("101") &&
        bitStr.slice(31, 36) === "01010" &&
        bitStr.endsWith("101")
      ) {
        let digits = "",
          valid = true;
        for (let i = 0; i < 4; i++) {
          const hit = lMap.get(bitStr.slice(3 + i * 7, 10 + i * 7));
          if (!hit) {
            valid = false;
            break;
          }
          digits += String(hit[1]);
        }
        for (let i = 0; i < 4 && valid; i++) {
          const rd = rMap.get(bitStr.slice(36 + i * 7, 43 + i * 7));
          if (rd === undefined) {
            valid = false;
            break;
          }
          digits += String(rd);
        }
        if (valid && eanCheckDigit(digits.slice(0, 7)) === digits[7]) {
          return { format: "EAN_8", value: digits };
        }
      }
    }
  }
  return null;
}

export async function scanCodesFromRgba(rgba, w, h) {
  const found = [];
  const pushUnique = (format, value) => {
    if (value && !found.some((f) => f.value === value)) {
      found.push({ format, value });
    }
  };
  const { default: jsQR } = await import("jsqr");
  const qr = jsQR(
    rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    w,
    h,
    { inversionAttempts: "attemptBoth" },
  );
  if (qr?.data) pushUnique("QR_CODE", qr.data);
  const b1d = decodeBarcode1DFromRgba(rgba, w, h);
  if (b1d) pushUnique(b1d.format, b1d.value);
  return found;
}

function b64UrlToBytes(segment) {
  const norm = String(segment || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function decodeJwt(token, secret = "") {
  const clean = String(token || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  const parts = clean.split(".");
  if (parts.length < 2 || parts.length > 3)
    throw new Error(
      "Formato JWT inválido (esperado header.payload.signature) / Invalid JWT format.",
    );
  const dec = new TextDecoder("utf-8", { fatal: true });
  let header, payload;
  try {
    header = JSON.parse(dec.decode(b64UrlToBytes(parts[0])));
    payload = JSON.parse(dec.decode(b64UrlToBytes(parts[1])));
  } catch {
    throw new Error(
      "Header ou Payload JWT não contém JSON válido / Invalid JWT JSON.",
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const claims = {};
  for (const key of ["iat", "nbf", "exp"]) {
    if (typeof payload[key] === "number") {
      claims[key + "Iso"] = new Date(payload[key] * 1000).toISOString();
    }
  }
  if (typeof payload.exp === "number") {
    claims.expired = nowSec >= payload.exp;
  }
  let signatureCheck = "not_checked";
  if (secret && parts[2] !== undefined) {
    const algMap = {
      HS256: "SHA-256",
      HS384: "SHA-384",
      HS512: "SHA-512",
    };
    const hashName = algMap[header.alg];
    if (!hashName) {
      signatureCheck = `unsupported_alg_${header.alg || "none"}`;
    } else {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: hashName },
        false,
        ["sign"],
      );
      const sigBuf = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      const expected = new Uint8Array(sigBuf);
      const actual = b64UrlToBytes(parts[2]);
      let diff = expected.length ^ actual.length;
      for (let i = 0; i < Math.min(expected.length, actual.length); i++)
        diff |= expected[i] ^ actual[i];
      signatureCheck = diff === 0 ? "valid" : "invalid";
    }
  }
  return { header, payload, claims, signatureCheck };
}

export function testRegex(pattern, flags = "g", content = "", replacement = "") {
  if (!String(pattern || ""))
    throw new Error("Informe a expressão regular / Enter a regex pattern.");
  const cleanFlags = [...new Set((String(flags || "g") + "g").split(""))].join("");
  const re = new RegExp(pattern, cleanFlags);
  const matches = [];
  const spans = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    matches.push({
      index: m.index,
      match: m[0],
      captures: m.slice(1),
      ...(m.groups ? { groups: m.groups } : {}),
    });
    if (m[0].length > 0) {
      spans.push([m.index, m.index + m[0].length]);
    }
    if (m[0].length === 0) re.lastIndex++;
    if (matches.length >= 500) break;
  }
  const hasReplacement = String(replacement || "") !== "";
  const replaced = hasReplacement ? content.replace(re, replacement) : undefined;
  return {
    count: matches.length,
    pattern: `/${pattern}/${cleanFlags}`,
    ...(hasReplacement ? { replaced } : {}),
    matches,
    spans,
  };
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String(fromCharCodeSafe(bytes[i]));
  return btoa(bin);
}
function fromCharCodeSafe(b) {
  return String.fromCharCode(b);
}

function parseYouTubeTimestamp(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    return (
      Number(m[1] || 0) * 3600 +
      Number(m[2] || 0) * 60 +
      Number(m[3] || 0)
    );
  }
  return 0;
}

export function extractYouTubeInfo(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw)
    throw new Error(
      "Informe uma URL ou ID do YouTube / Enter a YouTube URL or ID.",
    );
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return {
      videoId: raw,
      playlistId: null,
      channelId: null,
      channelHandle: null,
      startSeconds: 0,
      kind: "video",
    };
  }
  if (/^@[A-Za-z0-9_.-]{2,40}$/.test(raw)) {
    return {
      videoId: null,
      playlistId: null,
      channelId: null,
      channelHandle: raw,
      startSeconds: 0,
      kind: "channel",
    };
  }
  if (/^UC[A-Za-z0-9_-]{20,28}$/.test(raw)) {
    return {
      videoId: null,
      playlistId: null,
      channelId: raw,
      channelHandle: null,
      startSeconds: 0,
      kind: "channel",
    };
  }
  let urlStr = raw;
  if (!/^https?:\/\//i.test(urlStr) && /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(urlStr)) {
    urlStr = "https://" + urlStr.replace(/^\/+/, "");
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    const idMatch = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
    if (idMatch) {
      return {
        videoId: idMatch[1],
        playlistId: null,
        channelId: null,
        channelHandle: null,
        startSeconds: 0,
        kind: "video",
      };
    }
    throw new Error(
      "URL ou ID do YouTube inválido / Invalid YouTube URL or ID.",
    );
  }
  const host = parsed.hostname.replace(/^(www\.|m\.|music\.)/i, "").toLowerCase();
  if (!["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) {
    throw new Error(
      "Informe um link válido do YouTube (youtube.com ou youtu.be) / Enter a valid YouTube link.",
    );
  }
  let videoId = null;
  let kind = "video";
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" && pathParts[0]) {
    videoId = pathParts[0];
  } else if (parsed.searchParams.get("v")) {
    videoId = parsed.searchParams.get("v");
  } else if (
    ["shorts", "embed", "live", "v", "e"].includes(pathParts[0]) &&
    pathParts[1]
  ) {
    videoId = pathParts[1];
    if (pathParts[0] === "shorts") kind = "shorts";
    if (pathParts[0] === "live") kind = "live";
  }
  if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    videoId = videoId.slice(0, 11);
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) videoId = null;
  }
  const playlistId = parsed.searchParams.get("list") || null;
  let channelHandle = null;
  let channelId = null;
  if (pathParts[0]?.startsWith("@")) {
    channelHandle = pathParts[0];
    kind = "channel";
  } else if (pathParts[0] === "channel" && pathParts[1]) {
    channelId = pathParts[1];
    kind = "channel";
  } else if ((pathParts[0] === "c" || pathParts[0] === "user") && pathParts[1]) {
    channelHandle = "@" + pathParts[1].replace(/^@/, "");
    kind = "channel";
  } else if (!videoId && playlistId) {
    kind = "playlist";
  }
  const startSeconds = parseYouTubeTimestamp(
    parsed.searchParams.get("t") || parsed.searchParams.get("start"),
  );
  if (!videoId && !playlistId && !channelHandle && !channelId) {
    throw new Error(
      "Não foi possível identificar ID de vídeo, playlist ou canal na URL / Could not find a video, playlist or channel ID in the URL.",
    );
  }
  return {
    videoId,
    playlistId,
    channelId,
    channelHandle,
    startSeconds,
    kind,
  };
}

export function getYouTubeThumbnails(videoId) {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error(
      "Informe uma URL ou ID de vídeo válido do YouTube (11 caracteres) / Enter a valid 11-character YouTube video URL or ID.",
    );
  }
  return {
    maxresdefault: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    maxresWebp: `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
    sddefault: `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    hqdefault: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    mqdefault: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  };
}

export function buildYouTubeEmbed(rawUrl, opts = {}) {
  const info = extractYouTubeInfo(rawUrl);
  if (!info.videoId) {
    throw new Error(
      "O código Embed requer uma URL ou ID de vídeo/Short do YouTube / Embed generator requires a YouTube video or Short URL/ID.",
    );
  }
  const vid = info.videoId;
  const isVertical =
    opts.aspect === "9:16" || (!opts.aspect && info.kind === "shorts");
  const host =
    opts.privacy === "standard"
      ? "https://www.youtube.com"
      : "https://www.youtube-nocookie.com";
  const params = new URLSearchParams();
  const start = Number(opts.start || info.startSeconds || 0);
  if (start > 0) params.set("start", String(Math.floor(start)));
  if (String(opts.autoplay) === "1") {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }
  if (String(opts.loop) === "1") {
    params.set("loop", "1");
    params.set("playlist", vid);
  }
  if (String(opts.controls) === "0") {
    params.set("controls", "0");
  }
  params.set("rel", "0");
  const qs = params.toString();
  const src = `${host}/embed/${vid}${qs ? "?" + qs : ""}`;
  const ratio = isVertical ? "9 / 16" : "16 / 9";
  const maxWidth = isVertical ? "max-width:420px;margin:0 auto;" : "";
  const iframeCode = `<div style="position:relative;width:100%;${maxWidth}aspect-ratio:${ratio};overflow:hidden;border-radius:12px;background:#000">\n  <iframe\n    src="${src}"\n    title="YouTube video player"\n    style="position:absolute;inset:0;width:100%;height:100%;border:0"\n    loading="lazy"\n    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n    referrerpolicy="strict-origin-when-cross-origin"\n    allowfullscreen\n  ></iframe>\n</div>`;
  return { videoId: vid, src, isVertical, iframeCode };
}

const YOUTUBE_NICHE_CPM = {
  finance: { cpm: 12.0, label: "Finanças, Investimentos & Negócios / Finance & Business" },
  marketing: { cpm: 9.5, label: "Marketing Digital & E-commerce" },
  tech: { cpm: 8.5, label: "Tecnologia, Programação & IA / Tech & AI" },
  education: { cpm: 6.0, label: "Educação, Idiomas & Carreira / Education" },
  lifestyle: { cpm: 4.2, label: "Vlog, Lifestyle & Saúde / Lifestyle & Health" },
  gaming: { cpm: 2.8, label: "Games & Geek / Gaming" },
  entertainment: { cpm: 2.2, label: "Entretenimento, Cortes & Humor / Entertainment" },
  music: { cpm: 0.8, label: "Música & Shorts / Music & Shorts" },
};

export function calculateYouTubeMoney({
  views = 10000,
  niche = "tech",
  customCpm = 5,
  monetizedPct = 65,
  exchangeRate = 5.8,
} = {}) {
  const dailyViews = Math.max(1, Number(views) || 10000);
  const preset = YOUTUBE_NICHE_CPM[niche];
  const grossCpm =
    niche === "custom" || !preset
      ? Math.max(0.05, Number(customCpm) || 5)
      : preset.cpm;
  const monRate = Math.min(100, Math.max(5, Number(monetizedPct) || 65)) / 100;
  const fx = Math.max(0.5, Number(exchangeRate) || 5.8);
  const creatorShare = 0.55; // YouTube Partner standard 55% creator / 45% YouTube split
  const effectiveRpm = Number((grossCpm * monRate * creatorShare).toFixed(2));
  const dailyUsd = (dailyViews / 1000) * effectiveRpm;
  const monthlyUsd = dailyUsd * 30;
  const yearlyUsd = dailyUsd * 365;
  const round2 = (n) => Number(n.toFixed(2));
  return {
    niche: preset ? preset.label : "CPM Personalizado / Custom CPM",
    dailyViews,
    monthlyViews: dailyViews * 30,
    yearlyViews: dailyViews * 365,
    grossCpmUsd: round2(grossCpm),
    monetizedPlaybacksPct: Math.round(monRate * 100),
    creatorSharePct: 55,
    effectiveRpmUsd: effectiveRpm,
    effectiveRpmBrl: round2(effectiveRpm * fx),
    exchangeRateBrl: round2(fx),
    daily: {
      usd: round2(dailyUsd),
      brl: round2(dailyUsd * fx),
      minUsd: round2(dailyUsd * 0.75),
      maxUsd: round2(dailyUsd * 1.35),
      minBrl: round2(dailyUsd * 0.75 * fx),
      maxBrl: round2(dailyUsd * 1.35 * fx),
    },
    monthly: {
      usd: round2(monthlyUsd),
      brl: round2(monthlyUsd * fx),
      minUsd: round2(monthlyUsd * 0.75),
      maxUsd: round2(monthlyUsd * 1.35),
      minBrl: round2(monthlyUsd * 0.75 * fx),
      maxBrl: round2(monthlyUsd * 1.35 * fx),
    },
    yearly: {
      usd: round2(yearlyUsd),
      brl: round2(yearlyUsd * fx),
      minUsd: round2(yearlyUsd * 0.75),
      maxUsd: round2(yearlyUsd * 1.35),
      minBrl: round2(yearlyUsd * 0.75 * fx),
      maxBrl: round2(yearlyUsd * 1.35 * fx),
    },
  };
}

const STOPWORDS_YT = new Set([
  "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "um", "uma",
  "para", "por", "com", "sem", "que", "como", "mais", "mas", "ou", "se", "ao",
  "aos", "as", "os", "seu", "sua", "seus", "suas", "meu", "minha", "este",
  "esta", "isso", "esse", "essa", "foi", "ser", "sao", "está", "esta", "sobre",
  "entre", "ate", "the", "and", "for", "with", "that", "this", "from", "your",
  "you", "are", "was", "were", "have", "has", "how", "what", "when", "where",
  "who", "why", "http", "https", "www", "com", "watch", "youtu", "youtube",
]);

export function analyzeYouTubeMetadata(textInput = "", oembed = null) {
  const combined = [oembed?.title || "", String(textInput || "")].join("\n").trim();
  const hashtags = [
    ...new Set(
      (combined.match(/#[\p{L}\p{N}_-]+/gu) || []).map((h) => h.toLowerCase()),
    ),
  ];
  const chapters = [];
  const chapterRe = /(?:^|\n)\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—:|]?\s*([^\r\n]+)/g;
  let cm;
  while ((cm = chapterRe.exec(String(textInput || ""))) !== null) {
    chapters.push({ timestamp: cm[1], title: cm[2].trim() });
  }
  const links = [
    ...new Set(
      (String(textInput || "").match(/https?:\/\/[^\s)>\]"']+/gi) || []),
    ),
  ];
  const freq = new Map();
  const words = combined
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .match(/[\p{L}\p{N}]{3,}/gu) || [];
  for (const w of words) {
    if (/^\d+$/.test(w) || STOPWORDS_YT.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  const tagCandidates = [
    ...hashtags.map((h) => h.slice(1)),
    ...topKeywords.map((k) => k.word),
  ];
  const uniqueTags = [...new Set(tagCandidates)];
  let studioTagBlock = "";
  for (const tag of uniqueTags) {
    const next = studioTagBlock ? `${studioTagBlock}, ${tag}` : tag;
    if (next.length <= 500) studioTagBlock = next;
  }
  return {
    ...(oembed ? { oembed } : {}),
    hashtags,
    chapters,
    links,
    topKeywords,
    studioTagBlock,
  };
}

async function fetchYouTubeOembed(videoUrl, offline = false) {
  if (offline || typeof fetch !== "function") return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3200);
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.title) {
      return {
        title: data.title,
        authorName: data.author_name || "",
        authorUrl: data.author_url || "",
        thumbnailUrl: data.thumbnail_url || "",
        provider: data.provider_name || "YouTube",
      };
    }
  } catch {}
  return null;
}

export async function run(id, files, o, ctx = {}) {
  const s = String(o.content || "");
  let r;
  switch (id) {
    case "password-generator":
      r = password(o.length, o.charset);
      break;
    case "qr-code-studio": {
      const { default: QR } = await import("qrcode");
      let payload = s;
      const esc = (x) => String(x || "").replace(/[\\;,:\"]/g, "\\$&");
      if (o.kind === "wifi")
        payload = `WIFI:T:WPA;S:${esc(s)};P:${esc(o.extra)};;`;
      if (o.kind === "pix")
        payload = pixPayload(s, o.merchant, o.city, o.amount);
      if (o.kind === "vcard")
        payload = `BEGIN:VCARD\nVERSION:3.0\nFN:${s.replace(/[\r\n]/g, " ")}\nTEL:${String(o.extra || "").replace(/[\r\n]/g, "")}\nEND:VCARD`;
      if (!String(payload).trim())
        throw new Error("Conteúdo vazio / Empty QR content.");
      const hasLogo = Boolean(o.logoBytes);
      const ecLevel = hasLogo ? "H" : o.ecLevel || "M";
      const qrObj = QR.create(payload, { errorCorrectionLevel: ecLevel });
      const N = qrObj.modules.size;
      const data = qrObj.modules.data;
      const margin = 4;
      const totalMods = N + margin * 2;
      const dark = o.color || "#111111";
      const light = o.background || "#ffffff";
      const outFmt = o.outputFormat || "both";
      const logoFrac = Math.max(0.1, Math.min(0.28, Number(o.logoScale || 20) / 100));
      const outs = [];

      if (
        (outFmt === "png" || outFmt === "both") &&
        (typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined")
      ) {
        const S = 1024;
        const c = canvas(S, S),
          g = c.getContext("2d");
        g.fillStyle = light;
        g.fillRect(0, 0, S, S);
        const modPx = S / totalMods;
        g.fillStyle = dark;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            if (data[y * N + x]) {
              g.fillRect(
                Math.floor((x + margin) * modPx),
                Math.floor((y + margin) * modPx),
                Math.ceil(modPx),
                Math.ceil(modPx),
              );
            }
          }
        }
        if (hasLogo) {
          const { bitmap } = await import("../utils.js");
          const logoBmp = await bitmap(
            new Blob([o.logoBytes], { type: o.logoMime || "image/png" }),
          );
          const box = Math.round(S * logoFrac);
          const pad = Math.round(box * 0.14);
          const bx = (S - box - pad * 2) / 2;
          g.fillStyle = light;
          g.beginPath();
          g.roundRect(bx, bx, box + pad * 2, box + pad * 2, Math.round(box * 0.2));
          g.fill();
          g.drawImage(logoBmp, (S - box) / 2, (S - box) / 2, box, box);
          logoBmp.close?.();
        }
        outs.push(output(await toBlob(c), "tinylab-qrcode.png"));
      }

      if (outFmt === "svg" || outFmt === "both" || !outs.length) {
        let pathD = "";
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            if (data[y * N + x]) pathD += `M${x + margin} ${y + margin}h1v1h-1z`;
          }
        }
        let logoSvg = "";
        if (hasLogo) {
          const lMime = /^image\/(png|jpe?g|webp)$/i.test(o.logoMime || "")
            ? o.logoMime
            : "image/png";
          const b64 = bytesToBase64(new Uint8Array(o.logoBytes));
          const boxM = Number((totalMods * logoFrac).toFixed(2));
          const padM = Number((boxM * 0.14).toFixed(2));
          const bx = Number(((totalMods - boxM - padM * 2) / 2).toFixed(2));
          const ix = Number(((totalMods - boxM) / 2).toFixed(2));
          logoSvg = `\n<rect x="${bx}" y="${bx}" width="${(boxM + padM * 2).toFixed(2)}" height="${(boxM + padM * 2).toFixed(2)}" rx="${(boxM * 0.2).toFixed(2)}" fill="${light}"/>\n<image href="data:${lMime};base64,${b64}" x="${ix}" y="${ix}" width="${boxM}" height="${boxM}"/>`;
        }
        const svgStr = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalMods} ${totalMods}" width="1024" height="1024" shape-rendering="crispEdges">\n<rect width="${totalMods}" height="${totalMods}" fill="${light}"/>\n<path fill="${dark}" d="${pathD}"/>${logoSvg}\n</svg>`;
        outs.push(
          output(
            new Blob([svgStr], { type: "image/svg+xml" }),
            "tinylab-qrcode.svg",
            svgStr,
          ),
        );
      }

      outs.push(textOutput(payload, "tinylab-qrcode.txt"));
      return outs;
    }
    case "qr-scanner": {
      const { bitmap } = await import("../utils.js");
      const allDetected = [];
      for (let i = 0; i < files.length; i++) {
        progress(ctx, (i / files.length) * 90);
        const img = await bitmap(files[i]);
        try {
          const found = [];
          if (typeof BarcodeDetector !== "undefined") {
            try {
              const det = new BarcodeDetector();
              for (const b of await det.detect(img)) {
                if (b.rawValue) found.push({ format: b.format, value: b.rawValue });
              }
            } catch {}
          }
          const sc = Math.min(1, 1400 / Math.max(img.width, img.height));
          const cw = Math.max(1, Math.round(img.width * sc)),
            ch = Math.max(1, Math.round(img.height * sc));
          const c = canvas(cw, ch),
            g = c.getContext("2d");
          g.drawImage(img, 0, 0, cw, ch);
          const px = g.getImageData(0, 0, cw, ch);
          for (const hit of await scanCodesFromRgba(px.data, cw, ch)) {
            if (!found.some((f) => f.value === hit.value)) found.push(hit);
          }
          allDetected.push({ file: files[i].name, codes: found });
        } finally {
          img.close?.();
        }
      }
      const flat = allDetected.flatMap((d) =>
        d.codes.map((c) => `[${c.format}] ${c.value}`),
      );
      if (!flat.length)
        throw new Error(
          "Nenhum QR Code ou Código de Barras encontrado na imagem / No QR Code or Barcode detected in image.",
        );
      return [
        textOutput(flat.join("\n\n"), "codigos-lidos.txt"),
        textOutput(
          JSON.stringify(allDetected, null, 2),
          "codigos-lidos.json",
          "application/json",
        ),
      ];
    }
    case "barcode-generator": {
      const encoded = encodeBarcode(s, o.format || "CODE128");
      const showText = o.showText !== "no";
      const clr = o.color || "#111111";
      const bg = o.background || "#ffffff";
      const svgStr = buildBarcodeSvg(encoded, {
        color: clr,
        background: bg,
        showText,
      });
      const outs = [
        output(
          new Blob([svgStr], { type: "image/svg+xml" }),
          `barcode-${encoded.format.toLowerCase()}.svg`,
          svgStr,
        ),
      ];
      if (typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined") {
        const quiet = 12,
          modW = 4,
          barH = 140,
          textH = showText ? 34 : 0,
          padY = 20;
        const tw = (encoded.bits.length + quiet * 2) * modW;
        const th = barH + textH + padY * 2;
        const c = canvas(tw, th),
          g = c.getContext("2d");
        g.fillStyle = bg;
        g.fillRect(0, 0, tw, th);
        g.fillStyle = clr;
        for (let i = 0; i < encoded.bits.length; i++) {
          if (encoded.bits[i] === "1") {
            g.fillRect((quiet + i) * modW, padY, modW, barH);
          }
        }
        if (showText) {
          g.font = "600 20px monospace";
          g.textAlign = "center";
          g.fillText(encoded.label, tw / 2, padY + barH + 26);
        }
        outs.unshift(
          output(
            await toBlob(c),
            `barcode-${encoded.format.toLowerCase()}.png`,
          ),
        );
      }
      return outs;
    }
    case "jwt-decoder": {
      const info = await decodeJwt(s, o.secret || "");
      return [
        textOutput(
          JSON.stringify(info, null, 2),
          "jwt-decoded.json",
          "application/json",
        ),
      ];
    }
    case "regex-tester": {
      const resObj = testRegex(
        o.pattern,
        o.flags,
        s,
        o.replacement,
      );
      const { spans, ...cleanReport } = resObj;
      return [
        textOutput(
          JSON.stringify(cleanReport, null, 2),
          "regex-matches.json",
          "application/json",
        ),
        {
          regexPreview: {
            text: s,
            spans,
            replaced: resObj.replaced,
            count: resObj.count,
          },
        },
      ];
    }
    case "hash-crypto":
      r = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(o.algorithm, new TextEncoder().encode(s)),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      break;
    case "file-hash": {
      const res = [];
      for (let i = 0; i < files.length; i++) {
        progress(ctx, (i / files.length) * 100);
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await files[i].arrayBuffer()),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        res.push(`${hash}  ${files[i].name}`);
      }
      return [textOutput(res.join("\n"), "SHA256SUMS.txt")];
    }
    case "json-formatter":
      r = JSON.stringify(JSON.parse(s), null, Number(o.indent));
      return [textOutput(r, "tinylab.json", "application/json")];
    case "base64":
      if (o.mode === "encode") {
        const bytes = new TextEncoder().encode(s);
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        r = btoa(bin);
      } else
        r = new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0)),
        );
      break;
    case "url-codec":
      r = o.mode === "encode" ? encodeURIComponent(s) : decodeURIComponent(s);
      break;
    case "timestamp": {
      const n = Number(s);
      const d = /^\d+$/.test(s)
        ? new Date(n * (s.length <= 10 ? 1000 : 1))
        : new Date(s);
      if (!Number.isFinite(d.getTime()))
        throw new Error("Data inválida / Invalid date.");
      r = JSON.stringify(
        {
          iso: d.toISOString(),
          unix: Math.floor(d.getTime() / 1000),
          milliseconds: d.getTime(),
          local: d.toLocaleString(),
        },
        null,
        2,
      );
      break;
    }
    case "uuid":
      r = Array.from({ length: Number(o.count) }, () =>
        crypto.randomUUID(),
      ).join("\n");
      break;
    case "lorem-ipsum":
      r = Array.from(
        { length: Number(o.count) },
        () =>
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae justo sed ipsum facilisis volutpat. Suspendisse potenti. Curabitur id magna at neque consequat dignissim. Donec at turpis ut erat blandit tincidunt.",
      ).join("\n\n");
      break;
    case "color-converter": {
      const h = o.color,
        rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [a, b, c] = rgb.map((n) => n / 255),
        max = Math.max(a, b, c),
        min = Math.min(a, b, c),
        delta = max - min,
        l = (max + min) / 2;
      let hh = 0,
        ss = 0;
      if (delta) {
        ss = delta / (1 - Math.abs(2 * l - 1));
        hh =
          60 *
          (max === a
            ? ((b - c) / delta) % 6
            : max === b
              ? (c - a) / delta + 2
              : (a - b) / delta + 4);
        if (hh < 0) hh += 360;
      }
      r = `${h.toUpperCase()}\nrgb(${rgb.join(", ")})\nhsl(${Math.round(hh)}, ${Math.round(ss * 100)}%, ${Math.round(l * 100)}%)`;
      break;
    }
    case "youtube-thumbnail": {
      const info = extractYouTubeInfo(s);
      const thumbs = getYouTubeThumbnails(info.videoId);
      const vid = info.videoId;
      const resChoice = o.resolution || "all";
      const fmt = o.format || "jpg";
      const outs = [];
      const resOrder =
        resChoice === "all"
          ? ["maxresdefault", "sddefault", "hqdefault"]
          : [resChoice];

      if (o.offline !== true && typeof fetch === "function") {
        for (const resKey of resOrder) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4500);
            const targetUrl =
              fmt === "webp" && resKey === "maxresdefault"
                ? thumbs.maxresWebp
                : thumbs[resKey];
            let resp = await fetch(targetUrl, { signal: ctrl.signal });
            if (!resp.ok && resKey === "maxresdefault") {
              resp = await fetch(thumbs.hqdefault, { signal: ctrl.signal });
            }
            clearTimeout(timer);
            if (resp.ok) {
              let imgBlob = await resp.blob();
              let ext = fmt === "webp" && imgBlob.type === "image/webp" ? "webp" : "jpg";
              if (
                (fmt === "png" || (fmt === "webp" && ext !== "webp")) &&
                (typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined")
              ) {
                try {
                  const { bitmap } = await import("../utils.js");
                  const bmp = await bitmap(imgBlob);
                  const c = canvas(bmp.width, bmp.height);
                  c.getContext("2d").drawImage(bmp, 0, 0);
                  bmp.close?.();
                  const mime = fmt === "png" ? "image/png" : "image/webp";
                  imgBlob = await toBlob(c, mime, 0.92);
                  ext = fmt;
                } catch {}
              }
              outs.push(output(imgBlob, `youtube-${vid}-${resKey}.${ext}`));
            }
          } catch {}
        }
      }

      const report = [
        `YouTube Video ID: ${vid}`,
        `MaxRes HD (1280x720 JPG): ${thumbs.maxresdefault}`,
        `MaxRes HD (1280x720 WebP): ${thumbs.maxresWebp}`,
        `Standard SD (640x480 JPG): ${thumbs.sddefault}`,
        `High Quality HQ (480x360 JPG): ${thumbs.hqdefault}`,
        `Medium Quality MQ (320x180 JPG): ${thumbs.mqdefault}`,
      ].join("\n");
      outs.push(textOutput(report, `youtube-${vid}-thumbnails.txt`));
      return outs;
    }
    case "youtube-embed": {
      const emb = buildYouTubeEmbed(s, o);
      const htmlDoc = `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>YouTube Embed — ${emb.videoId}</title>\n</head>\n<body style="margin:0;padding:24px;background:#0d0c14;color:#f5f3ff;font-family:system-ui,sans-serif">\n${emb.iframeCode}\n</body>\n</html>`;
      return [
        output(
          new Blob([htmlDoc], { type: "text/html;charset=utf-8" }),
          `youtube-embed-${emb.videoId}.html`,
          emb.iframeCode,
        ),
      ];
    }
    case "youtube-money-calculator": {
      const calc = calculateYouTubeMoney(o);
      const fmtNum = (n) => Number(n).toLocaleString("pt-BR");
      const fmtUsd = (n) => `$ ${Number(n).toFixed(2)}`;
      const fmtBrl = (n) => `R$ ${Number(n).toFixed(2)}`;
      const summary = [
        `=== ESTIMATIVA DE MONETIZAÇÃO DO YOUTUBE (CPM / RPM) ===`,
        `Nicho: ${calc.niche}`,
        `Visualizações/dia: ${fmtNum(calc.dailyViews)} (${fmtNum(calc.monthlyViews)}/mês · ${fmtNum(calc.yearlyViews)}/ano)`,
        `CPM Bruto dos Anunciantes: ${fmtUsd(calc.grossCpmUsd)} (${calc.monetizedPlaybacksPct}% exibições monetizadas)`,
        `RPM Efetivo do Criador (55% AdSense): ${fmtUsd(calc.effectiveRpmUsd)} / 1.000 views (${fmtBrl(calc.effectiveRpmBrl)})`,
        `Cotação considerada: US$ 1.00 = ${fmtBrl(calc.exchangeRateBrl)}`,
        ``,
        `• GANHO DIÁRIO ESTIMADO:`,
        `  Média: ${fmtBrl(calc.daily.brl)} (${fmtUsd(calc.daily.usd)})`,
        `  Faixa: ${fmtBrl(calc.daily.minBrl)} a ${fmtBrl(calc.daily.maxBrl)} (${fmtUsd(calc.daily.minUsd)} – ${fmtUsd(calc.daily.maxUsd)})`,
        ``,
        `• GANHO MENSAL ESTIMADO (30 dias):`,
        `  Média: ${fmtBrl(calc.monthly.brl)} (${fmtUsd(calc.monthly.usd)})`,
        `  Faixa: ${fmtBrl(calc.monthly.minBrl)} a ${fmtBrl(calc.monthly.maxBrl)} (${fmtUsd(calc.monthly.minUsd)} – ${fmtUsd(calc.monthly.maxUsd)})`,
        ``,
        `• GANHO ANUAL ESTIMADO (365 dias):`,
        `  Média: ${fmtBrl(calc.yearly.brl)} (${fmtUsd(calc.yearly.usd)})`,
        `  Faixa: ${fmtBrl(calc.yearly.minBrl)} a ${fmtBrl(calc.yearly.maxBrl)} (${fmtUsd(calc.yearly.minUsd)} – ${fmtUsd(calc.yearly.maxUsd)})`,
      ].join("\n");
      return [
        textOutput(summary, "youtube-monetizacao.txt"),
        textOutput(
          JSON.stringify(calc, null, 2),
          "youtube-monetizacao.json",
          "application/json",
        ),
      ];
    }
    case "youtube-id-extractor": {
      const info = extractYouTubeInfo(s);
      const ts = Math.max(0, Number(o.timestamp || info.startSeconds || 0));
      const links = {};
      let oembed = null;
      if (info.videoId) {
        const vid = info.videoId;
        links.watchUrl = `https://www.youtube.com/watch?v=${vid}${ts > 0 ? `&t=${ts}s` : ""}`;
        links.shortUrl = `https://youtu.be/${vid}${ts > 0 ? `?t=${ts}` : ""}`;
        links.shortsUrl = `https://www.youtube.com/shorts/${vid}`;
        links.embedUrl = `https://www.youtube.com/embed/${vid}${ts > 0 ? `?start=${ts}` : ""}`;
        links.embedNoCookieUrl = `https://www.youtube-nocookie.com/embed/${vid}${ts > 0 ? `?start=${ts}` : ""}`;
        links.thumbnails = getYouTubeThumbnails(vid);
        oembed = await fetchYouTubeOembed(
          `https://www.youtube.com/watch?v=${vid}`,
          o.offline === true,
        );
      }
      if (info.playlistId) {
        links.playlistUrl = `https://www.youtube.com/playlist?list=${info.playlistId}`;
      }
      const chBase = info.channelHandle
        ? `https://www.youtube.com/${info.channelHandle}`
        : info.channelId
          ? `https://www.youtube.com/channel/${info.channelId}`
          : oembed?.authorUrl || null;
      if (chBase) {
        links.channelUrl = chBase;
        links.subscribeConfirmUrl = `${chBase}${chBase.includes("?") ? "&" : "?"}sub_confirmation=1`;
      }
      const payload = {
        ...info,
        ...(oembed ? { oembed } : {}),
        links,
      };
      const lines = [
        `Tipo detectado / Detected kind: ${info.kind}`,
        ...(info.videoId ? [`Video ID: ${info.videoId}`] : []),
        ...(info.playlistId ? [`Playlist ID: ${info.playlistId}`] : []),
        ...(info.channelHandle ? [`Channel Handle: ${info.channelHandle}`] : []),
        ...(info.channelId ? [`Channel ID: ${info.channelId}`] : []),
        ...(oembed?.title ? [`Título / Title: ${oembed.title}`] : []),
        ...(oembed?.authorName ? [`Canal / Channel: ${oembed.authorName}`] : []),
        ``,
        ...(links.watchUrl ? [`Link Padrão: ${links.watchUrl}`] : []),
        ...(links.shortUrl ? [`Link Curto: ${links.shortUrl}`] : []),
        ...(links.embedNoCookieUrl ? [`Link Embed (No-Cookie): ${links.embedNoCookieUrl}`] : []),
        ...(links.subscribeConfirmUrl
          ? [`Link de Inscrição Direta (?sub_confirmation=1): ${links.subscribeConfirmUrl}`]
          : []),
        ...(links.playlistUrl ? [`Link da Playlist: ${links.playlistUrl}`] : []),
        ...(links.thumbnails
          ? [
              ``,
              `Thumbnails:`,
              `  MaxRes (1280x720): ${links.thumbnails.maxresdefault}`,
              `  WebP (1280x720): ${links.thumbnails.maxresWebp}`,
              `  SD (640x480): ${links.thumbnails.sddefault}`,
              `  HQ (480x360): ${links.thumbnails.hqdefault}`,
            ]
          : []),
      ];
      return [
        textOutput(lines.join("\n"), "youtube-links.txt"),
        textOutput(
          JSON.stringify(payload, null, 2),
          "youtube-links.json",
          "application/json",
        ),
      ];
    }
    case "youtube-metadata": {
      const rawUrl = String(o.url || "").trim();
      let videoInfo = null;
      let oembed = null;
      if (rawUrl) {
        try {
          videoInfo = extractYouTubeInfo(rawUrl);
          if (videoInfo.videoId) {
            oembed = await fetchYouTubeOembed(
              `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
              o.offline === true,
            );
          }
        } catch {}
      }
      if (!s.trim() && !videoInfo) {
        throw new Error(
          "Informe a URL do vídeo ou cole a descrição/texto para extrair metadados / Enter a video URL or paste description text.",
        );
      }
      const meta = analyzeYouTubeMetadata(s, oembed);
      const reportLines = [
        `=== METADADOS, CAPÍTULOS E TAGS DO VÍDEO ===`,
        ...(videoInfo?.videoId ? [`Video ID: ${videoInfo.videoId}`] : []),
        ...(oembed?.title ? [`Título: ${oembed.title}`] : []),
        ...(oembed?.authorName ? [`Canal: ${oembed.authorName} (${oembed.authorUrl})`] : []),
        ``,
        `--- CAPÍTULOS / TIMESTAMPS (${meta.chapters.length}) ---`,
        ...(meta.chapters.length
          ? meta.chapters.map((c) => `${c.timestamp} ${c.title}`)
          : ["(Nenhum capítulo 00:00 encontrado no texto)"]),
        ``,
        `--- HASHTAGS EXTRAÍDAS (${meta.hashtags.length}) ---`,
        meta.hashtags.length ? meta.hashtags.join(" ") : "(Nenhuma #hashtag encontrada)",
        ``,
        `--- BLOCO DE TAGS PARA YOUTUBE STUDIO (<= 500 caracteres) ---`,
        meta.studioTagBlock || "(Sem palavras-chave suficientes)",
        ``,
        `--- LINKS ENCONTRADOS (${meta.links.length}) ---`,
        ...(meta.links.length ? meta.links : ["(Nenhum link https:// encontrado)"]),
      ];
      return [
        textOutput(reportLines.join("\n"), "youtube-metadata.txt"),
        textOutput(
          JSON.stringify({ videoInfo, ...meta }, null, 2),
          "youtube-metadata.json",
          "application/json",
        ),
      ];
    }
    default:
      throw new Error("Ferramenta desconhecida / Unknown tool.");
  }
  return [textOutput(r)];
}
