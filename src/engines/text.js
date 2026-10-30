import { textOutput } from "../utils.js";
export function compareLines(a, b) {
  const aa = a.split("\n"),
    bb = b.split("\n");
  if (aa.length * bb.length > 4e6)
    throw new Error(
      "Comparação limitada a 4 milhões de pares de linhas / Comparison is limited to 4 million line pairs.",
    );
  const dp = Array.from(
    { length: aa.length + 1 },
    () => new Uint32Array(bb.length + 1),
  );
  for (let i = aa.length - 1; i >= 0; i--)
    for (let j = bb.length - 1; j >= 0; j--)
      dp[i][j] =
        aa[i] === bb[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0,
    j = 0,
    res = [];
  while (i < aa.length || j < bb.length) {
    if (i < aa.length && j < bb.length && aa[i] === bb[j]) {
      res.push(`  ${aa[i++]}`);
      j++;
    } else if (
      j < bb.length &&
      (i === aa.length || dp[i][j + 1] >= dp[i + 1][j])
    )
      res.push(`+ ${bb[j++]}`);
    else res.push(`- ${aa[i++]}`);
  }
  return res.join("\n");
}
export async function run(id, files, o) {
  const s = String(o.content || "");
  let r = s;
  switch (id) {
    case "word-counter": {
      const words = s.trim() ? s.trim().split(/\s+/u).length : 0;
      r = JSON.stringify(
        {
          words,
          palavras: words,
          characters: [...s].length,
          charactersWithoutSpaces: [...s.replace(/\s/g, "")].length,
          lines: s ? s.split("\n").length : 0,
          readingMinutes: Math.ceil(words / 200),
        },
        null,
        2,
      );
      break;
    }
    case "clean-text":
      r = s
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((l) => l.replace(/[\t ]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      break;
    case "case-text":
      r =
        o.mode === "upper"
          ? s.toLocaleUpperCase()
          : o.mode === "lower"
            ? s.toLocaleLowerCase()
            : o.mode === "title"
              ? s
                  .toLocaleLowerCase()
                  .replace(/(^|\s)\p{L}/gu, (m) => m.toLocaleUpperCase())
              : s
                  .toLocaleLowerCase()
                  .replace(/(^|[.!?]\s+)\p{L}/gu, (m) => m.toLocaleUpperCase());
      break;
    case "dedupe-text":
      r = [...new Set(s.split(/\r?\n/))].join("\n");
      break;
    case "sort-text":
      r = s
        .split(/\r?\n/)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (o.order === "desc") r.reverse();
      r = r.join("\n");
      break;
    case "compare-text":
      r = compareLines(s, o.other || "");
      break;
    case "markdown-preview":
      return [textOutput(s, "tinylab.md", "text/markdown"), { markdown: s }];
    case "text-replace":
      if (!o.find) throw new Error("Preencha Localizar / Fill Find.");
      r = s.split(o.find).join(o.replacement || "");
      break;
    default:
      throw new Error("Ferramenta desconhecida / Unknown tool.");
  }
  return [textOutput(r)];
}
