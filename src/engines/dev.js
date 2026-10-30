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
      const c = canvas(1024, 1024);
      await QR.toCanvas(c, payload, {
        width: 1024,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: o.color, light: o.background },
      });
      return [
        output(await toBlob(c), "tinylab-qrcode.png"),
        textOutput(payload, "tinylab-qrcode.txt"),
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
    default:
      throw new Error("Ferramenta desconhecida / Unknown tool.");
  }
  return [textOutput(r)];
}
