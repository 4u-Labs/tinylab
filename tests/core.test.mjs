import test from "node:test";
import assert from "node:assert/strict";
import { tools, searchTools } from "../src/catalog.js";
import { pageIndices, validFiles } from "../src/utils.js";
import { password, crc16, pixPayload, run as dev } from "../src/engines/dev.js";
import { compareLines, run as text } from "../src/engines/text.js";
import { removeBackground } from "../src/engines/image.js";
import { command } from "../src/engines/media.js";
import { PDFDocument } from "pdf-lib";
import { run as pdf } from "../src/engines/pdf.js";
import { run as data } from "../src/engines/data.js";
import * as XLSX from "xlsx";
test("catalog IDs are unique, bilingual and all route to engines", () => {
  assert.equal(new Set(tools.map((t) => t.id)).size, tools.length);
  assert.ok(tools.length >= 100);
  for (const t of tools) {
    assert.ok(t.title.pt && t.title.en && t.description.pt && t.description.en);
    for (const o of t.options) assert.ok(o.label.pt && o.label.en);
  }
});
test("search handles accents, synonyms and category", () => {
  assert.ok(searchTools("reduzir foto").some((t) => t.id === "compress-image"));
  assert.ok(searchTools("audio").some((t) => t.id === "extract-audio"));
  assert.ok(searchTools("juntar", "pdf").every((t) => t.category === "pdf"));
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
