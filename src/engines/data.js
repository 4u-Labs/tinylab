import * as XLSX from "xlsx";
import {
  textOutput,
  output,
  baseName,
  progress,
  check,
  safeName,
} from "../utils.js";
export function parseXML(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error(
      "DTD/entidades externas não são aceitas / DTD and external entities are not accepted.",
    );
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.querySelector("parsererror"))
    throw new Error("XML inválido / Invalid XML.");
  function convert(el) {
    const obj = Object.create(null);
    if (el.attributes.length)
      obj["@attributes"] = Object.fromEntries(
        [...el.attributes].map((a) => [a.name, a.value]),
      );
    for (const c of el.children) {
      const value = convert(c);
      if (Object.hasOwn(obj, c.tagName))
        obj[c.tagName] = Array.isArray(obj[c.tagName])
          ? [...obj[c.tagName], value]
          : [obj[c.tagName], value];
      else obj[c.tagName] = value;
    }
    const content = [...el.childNodes]
      .filter((n) => n.nodeType === 3 || n.nodeType === 4)
      .map((n) => n.textContent)
      .join("")
      .trim();
    if (!el.children.length && !el.attributes.length) return el.textContent;
    if (content) obj["#text"] = content;
    return obj;
  }
  return { [d.documentElement.tagName]: convert(d.documentElement) };
}
export function toXML(obj, root = "root") {
  const esc = (s) =>
    String(s).replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  const name = (s) => {
    if (!/^[A-Za-z_][\w.-]*$/.test(s))
      throw new Error(`Nome XML inválido: ${s} / Invalid XML element name.`);
    return s;
  };
  function node(key, value) {
    key = name(key);
    if (Array.isArray(value)) return value.map((v) => node(key, v)).join("");
    if (value && typeof value === "object") {
      const attrs = Object.entries(value["@attributes"] || {})
        .map(([k, v]) => ` ${name(k)}="${esc(v)}"`)
        .join("");
      const children = Object.entries(value)
        .filter(([k]) => k !== "@attributes" && k !== "#text")
        .map(([k, v]) => node(k, v))
        .join("");
      return `<${key}${attrs}>${value["#text"] ? esc(value["#text"]) : ""}${children}</${key}>`;
    }
    return `<${key}>${value == null ? "" : esc(value)}</${key}>`;
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    node(root, Array.isArray(obj) ? { item: obj } : obj)
  );
}
function records(obj) {
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== "object")
    throw new Error(
      "Esperada uma lista de objetos / Expected an array of objects.",
    );
  const values = Object.values(obj);
  const arr = values.find(Array.isArray);
  if (arr) return arr;
  if (values.length === 1) return records(values[0]);
  return [obj];
}
const flatRows = (rows) =>
  rows.map((row) =>
    typeof row === "object" && row !== null
      ? Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === "object" ? JSON.stringify(v) : v,
          ]),
        )
      : { value: row },
  );
function workbook(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(flatRows(rows)),
    "Dados",
  );
  return wb;
}
const excelOutput = (wb, name) =>
  output(
    new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    name,
  );
async function tablePDF(wb, ctx) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const { embedFont } = await import("./pdf.js");
  const doc = await PDFDocument.create(),
    font = await embedFont(doc),
    supported = new Set(font.getCharacterSet()),
    clean = (s) =>
      [...String(s ?? "")]
        .map((c) => (supported.has(c.codePointAt(0)) ? c : "?"))
        .join("");
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    });
    if (rows.length > 10000)
      throw new Error(
        "Exporte até 10.000 linhas por PDF / Export up to 10,000 rows per PDF.",
      );
    const cols = Math.max(1, ...rows.map((r) => r.length));
    for (let col = 0; col < cols; col += 8) {
      const n = Math.min(8, cols - col),
        cw = 782 / n;
      let page, y;
      const add = () => {
        page = doc.addPage([842, 595]);
        page.drawText(clean(`${sheetName} · ${col + 1}–${col + n}`), {
          x: 30,
          y: 565,
          font,
          size: 12,
        });
        y = 540;
      };
      add();
      const drawRow = (row, isHeader = false) => {
        const lines = Array.from({ length: n }, (_, j) => {
          const text = clean(row[col + j]);
          const chunks = [];
          let line = "";
          for (const char of text) {
            if (font.widthOfTextAtSize(line + char, 8) > cw - 10) {
              chunks.push(line);
              line = "";
            }
            line += char;
          }
          chunks.push(line);
          return chunks;
        });
        const max = Math.max(...lines.map((l) => l.length));
        for (let li = 0; li < max; li++) {
          if (y < 35) {
            add();
            if (!isHeader && rows[0]) drawRow(rows[0], true);
          }
          for (let j = 0; j < n; j++) {
            page.drawText(lines[j][li] || "", {
              x: 35 + j * cw,
              y,
              font,
              size: 8,
              color: isHeader ? rgb(0.35, 0.15, 0.65) : rgb(0.1, 0.1, 0.15),
            });
          }
          y -= 12;
        }
        page.drawLine({
          start: { x: 30, y: y + 6 },
          end: { x: 812, y: y + 6 },
          thickness: 0.3,
          color: rgb(0.8, 0.8, 0.8),
        });
        y -= 6;
      };
      for (let i = 0; i < rows.length; i++) {
        check(ctx);
        drawRow(rows[i], i === 0);
      }
    }
  }
  return output(
    new Blob([await doc.save()], { type: "application/pdf" }),
    "tinylab-tabelas.pdf",
  );
}
export async function run(id, files, o, ctx = {}) {
  if (id === "create-zip") {
    const { zipOutputs } = await import("../utils.js");
    return [
      await zipOutputs(
        files.map((f) => output(f, f.name)),
        "tinylab-arquivos.zip",
        ctx,
      ),
    ];
  }
  if (id === "extract-zip") {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await files[0].arrayBuffer()),
      entries = Object.values(zip.files).filter((f) => !f.dir);
    if (entries.length > 1000)
      throw new Error("ZIP excede 1.000 arquivos / ZIP exceeds 1,000 entries.");
    const outputs = [];
    let total = 0;
    for (let i = 0; i < entries.length; i++) {
      check(ctx);
      const entry = entries[i],
        size = entry._data?.uncompressedSize || 0;
      if (size > 100 * 1024 ** 2 || (total += size) > 512 * 1024 ** 2)
        throw new Error(
          "ZIP descompactado excede os limites de memória / Uncompressed ZIP exceeds memory limits.",
        );
      const b = await entry.async("uint8array");
      if (b.length > 100 * 1024 ** 2)
        throw new Error(
          "Arquivo descompactado muito grande / Extracted file too large.",
        );
      outputs.push(output(new Blob([b]), safeName(entry.name)));
      progress(ctx, ((i + 1) / entries.length) * 100);
    }
    if (!outputs.length) throw new Error("ZIP vazio / Empty ZIP.");
    return outputs;
  }
  const file = files[0],
    name = baseName(file.name);
  if (id === "xml-to-json")
    return [
      textOutput(
        JSON.stringify(parseXML(await file.text()), null, 2),
        `${name}.json`,
        "application/json",
      ),
    ];
  if (id === "json-to-xml")
    return [
      textOutput(
        toXML(JSON.parse(await file.text()), o.root),
        `${name}.xml`,
        "application/xml",
      ),
    ];
  let wb;
  if (id === "json-to-csv" || id === "json-to-excel")
    wb = workbook(records(JSON.parse(await file.text())));
  else if (id === "xml-to-excel")
    wb = workbook(records(parseXML(await file.text())));
  else
    wb = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
    });
  if (!wb.SheetNames.length)
    throw new Error("Planilha sem abas / Spreadsheet has no sheets.");
  if (id === "csv-to-excel" || id === "json-to-excel" || id === "xml-to-excel")
    return [excelOutput(wb, `${name}.xlsx`)];
  if (id === "csv-to-json") {
    return [
      textOutput(
        JSON.stringify(
          XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }),
          null,
          2,
        ),
        `${name}.json`,
        "application/json",
      ),
    ];
  }
  if (id === "excel-to-json") {
    const obj = Object.fromEntries(
      wb.SheetNames.map((s) => [
        s,
        XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: "" }),
      ]),
    );
    return [
      textOutput(
        JSON.stringify(obj, null, 2),
        `${name}.json`,
        "application/json",
      ),
    ];
  }
  if (id === "excel-to-xml") {
    const sheets = wb.SheetNames.map((s) => ({
      "@attributes": { name: s },
      row: XLSX.utils
        .sheet_to_json(wb.Sheets[s], { defval: "" })
        .map((row) => ({
          cell: Object.entries(row).map(([k, v]) => ({
            "@attributes": { name: k },
            "#text": String(v),
          })),
        })),
    }));
    return [
      textOutput(
        toXML({ sheet: sheets }, "workbook"),
        `${name}.xml`,
        "application/xml",
      ),
    ];
  }
  if (id === "excel-to-pdf") return [await tablePDF(wb, ctx)];
  if (id === "excel-to-csv" || id === "json-to-csv") {
    const selected = o.sheet ? [o.sheet] : wb.SheetNames;
    return selected.map((s) => {
      if (!wb.Sheets[s])
        throw new Error(`Aba inexistente / Missing sheet: ${s}`);
      return textOutput(
        "\uFEFF" + XLSX.utils.sheet_to_csv(wb.Sheets[s]),
        `${name}-${baseName(s)}.csv`,
        "text/csv;charset=utf-8",
      );
    });
  }
  if (id === "split-csv" || id === "split-excel") {
    const outputs = [];
    for (const sheet of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
        header: 1,
        defval: "",
      });
      if (!rows.length) continue;
      const header = rows.shift(),
        size = Number(o.rows);
      if (!Number.isInteger(size) || size < 1)
        throw new Error("Quantidade de linhas inválida / Invalid row count.");
      for (let i = 0; i < rows.length; i += size) {
        const target = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          target,
          XLSX.utils.aoa_to_sheet([header, ...rows.slice(i, i + size)]),
          sheet,
        );
        outputs.push(
          id === "split-excel"
            ? excelOutput(
                target,
                `${name}-${baseName(sheet)}-${Math.floor(i / size) + 1}.xlsx`,
              )
            : textOutput(
                "\uFEFF" + XLSX.utils.sheet_to_csv(target.Sheets[sheet]),
                `${name}-${Math.floor(i / size) + 1}.csv`,
                "text/csv;charset=utf-8",
              ),
        );
        progress(ctx, (i / Math.max(1, rows.length)) * 95);
      }
    }
    return outputs;
  }
  throw new Error("Ferramenta desconhecida / Unknown tool.");
}
